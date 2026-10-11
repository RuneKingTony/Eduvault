import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import {
  GUARDIAN_SHARED_RESET_MESSAGE,
  GUARDIAN_STAFF_RESET_MESSAGE,
  type GuardianDraftInput,
} from '@eduvault/api-contract';
import type { AccountService, OrgContext } from '../../common/auth';
import type { FilesService } from '../../common/files';
import { FakeGuardianRepository } from './fake-guardian.repository';
import { GuardianService } from './guardian.service';

const ORG = 'school-a';

const context = (...permissions: Permission[]): OrgContext => ({
  user: { id: 'staff-1', email: 'admin@example.com', name: 'Tunde' },
  organizationId: ORG,
  roles: ['administrator'],
  permissions: toPermissionMap(permissions),
  isOwner: false,
  activeCampusId: null,
  campusScope: 'all',
  classScope: 'all',
  acting: null,
  headers: new Headers(),
});

const admin = context('guardian:read', 'guardian:link', 'guardian:create');
const linker = context('guardian:read', 'guardian:link');

const setup = () => {
  const repository = new FakeGuardianRepository();
  const discarded: string[] = [];
  const accounts = {
    hashPassword: (password: string) => Promise.resolve(`hash:${password}`),
  } as unknown as AccountService;
  const files = {
    discardById: (_org: string, id: string) => {
      discarded.push(id);
      return Promise.resolve();
    },
  } as unknown as FilesService;
  const service = new GuardianService(repository, accounts, files);
  repository.tx.students.set(`${ORG}:ada`, {
    id: 'ada',
    firstName: 'Ada',
    lastName: 'Okeke',
    onRoll: true,
    campusId: 'lekki',
  });
  repository.visibleStudentIds.add('ada');
  return { repository, service, discarded, tx: repository.tx };
};

const newGuardian = (overrides: Record<string, unknown> = {}) =>
  ({
    new: {
      fullName: 'Ngozi Okeke',
      phone: '08012345678',
      address: '4 Palm Close',
      relationship: 'mother',
      paysFees: false,
      login: { kind: 'email', email: 'ngozi@example.com' },
      ...overrides,
    },
  }) as unknown as GuardianDraftInput;

const asDraft = (draft: GuardianDraftInput) =>
  draft as Parameters<GuardianService['link']>[2];

const usernameGuardian = (name: string) =>
  newGuardian({ fullName: name, login: { kind: 'username' } });

describe('GuardianService.link a new guardian', () => {
  it('creates the user, member row, guardian and link, and returns the password once', async () => {
    const { service, tx } = setup();

    const result = await service.link(admin, 'ada', asDraft(newGuardian()));

    expect(result.login).toMatchObject({
      who: 'guardian',
      name: 'Ngozi Okeke',
      email: 'ngozi@example.com',
      existing: false,
    });
    expect(result.login?.temporaryPassword).toBeDefined();
    const [user] = [...tx.users.values()];
    expect(user?.passwordHash).toBe(`hash:${result.login?.temporaryPassword}`);
    expect(tx.rolesOf(ORG, user?.id ?? '')).toEqual(['guardian']);
    expect(result.link).toMatchObject({
      fullName: 'Ngozi Okeke',
      paysFees: true,
    });
    expect(tx.activity[0]).toMatchObject({
      kind: 'guardian.linked',
      text: 'Ngozi Okeke linked to Ada Okeke.',
    });
  });

  it('refuses a new guardian without guardian:create with 403 and writes nothing', async () => {
    const { service, tx } = setup();

    await expect(
      service.link(linker, 'ada', asDraft(newGuardian()))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.guardians.size).toBe(0);
    expect(tx.users.size).toBe(0);
  });

  it('answers 409 with the guardian name when the email already belongs to one here', async () => {
    const { service } = setup();
    await service.link(admin, 'ada', asDraft(newGuardian()));

    await expect(
      service.link(admin, 'ada', asDraft(newGuardian({ fullName: 'Someone' })))
    ).rejects.toMatchObject({
      response: {
        message:
          'ngozi@example.com already belongs to Ngozi Okeke. Link the existing guardian instead.',
      },
    });
  });

  it('links the existing user of another school without a new password', async () => {
    const { service, tx } = setup();
    tx.users.set('user-x', {
      id: 'user-x',
      email: 'ngozi@example.com',
      username: null,
      passwordHash: 'old',
    });
    tx.members.set('school-b:user-x', ['guardian']);

    const result = await service.link(admin, 'ada', asDraft(newGuardian()));

    expect(tx.users.size).toBe(1);
    expect(result.login).toMatchObject({ existing: true });
    expect(result.login?.temporaryPassword).toBeUndefined();
    expect(tx.rolesOf(ORG, 'user-x')).toEqual(['guardian']);
    expect(tx.rolesOf('school-b', 'user-x')).toEqual(['guardian']);
  });

  it('adds the guardian role to a staff member of this school', async () => {
    const { service, tx } = setup();
    tx.users.set('teacher-1', {
      id: 'teacher-1',
      email: 'ngozi@example.com',
      username: null,
      passwordHash: 'old',
    });
    tx.members.set(`${ORG}:teacher-1`, ['teacher']);

    const result = await service.link(admin, 'ada', asDraft(newGuardian()));

    expect(tx.rolesOf(ORG, 'teacher-1')).toEqual(['teacher', 'guardian']);
    expect(result.login?.temporaryPassword).toBeUndefined();
  });

  it('derives a username and numbers a clash', async () => {
    const { service, tx } = setup();

    const first = await service.link(
      admin,
      'ada',
      asDraft(usernameGuardian('Mrs Udoh'))
    );
    const second = await service.link(
      admin,
      'ada',
      asDraft(usernameGuardian('Mr Udoh'))
    );

    expect(first.login?.username).toBe('udoh-family');
    expect(second.login?.username).toBe('udoh-family2');
    expect(first.login?.email).toBeUndefined();
    expect(tx.users.size).toBe(2);
  });

  it('answers 400 over the maximum and 404 for a student out of scope', async () => {
    const { service, tx, repository } = setup();
    tx.schoolRules = { maxGuardians: 1, requireGuardian: true };
    await service.link(admin, 'ada', asDraft(newGuardian()));

    await expect(
      service.link(
        admin,
        'ada',
        asDraft(newGuardian({ login: { kind: 'username' } }))
      )
    ).rejects.toThrow('A student can have at most 1 guardian.');
    repository.visibleStudentIds.clear();
    await expect(
      service.link(admin, 'ada', asDraft(newGuardian()))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a photo that is not this school’s free upload with 400', async () => {
    const { service } = setup();

    await expect(
      service.link(
        admin,
        'ada',
        asDraft(newGuardian({ photoFileId: crypto.randomUUID() }))
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

const seed = async () => {
  const env = setup();
  const created = await env.service.link(
    admin,
    'ada',
    asDraft(newGuardian({ paysFees: true }))
  );
  env.tx.students.set(`${ORG}:chidi`, {
    id: 'chidi',
    firstName: 'Chidi',
    lastName: 'Okeke',
    onRoll: true,
    campusId: 'lekki',
  });
  env.repository.visibleStudentIds.add('chidi');
  return { ...env, guardianId: created.link.guardianId };
};

describe('GuardianService.link an existing guardian', () => {
  it('links, makes the first guardian the payer and restores a removed membership', async () => {
    const { service, tx, guardianId } = await seed();
    const userId = tx.guardians.get(guardianId)?.userId ?? '';
    tx.members.delete(`${ORG}:${userId}`);

    const result = await service.link(admin, 'chidi', {
      existingGuardianId: guardianId,
      relationship: 'mother',
      paysFees: false,
    });

    expect(result.link.paysFees).toBe(true);
    expect(result.login).toBeUndefined();
    expect(tx.rolesOf(ORG, userId)).toEqual(['guardian']);
  });

  it('answers 409 when already linked and 404 for an unknown guardian', async () => {
    const { service, guardianId } = await seed();

    await expect(
      service.link(admin, 'ada', {
        existingGuardianId: guardianId,
        relationship: 'mother',
        paysFees: false,
      })
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.link(admin, 'ada', {
        existingGuardianId: crypto.randomUUID(),
        relationship: 'mother',
        paysFees: false,
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

const withTwo = async () => {
  const env = setup();
  const mother = await env.service.link(
    admin,
    'ada',
    asDraft(newGuardian({ paysFees: true }))
  );
  const father = await env.service.link(
    admin,
    'ada',
    asDraft(
      newGuardian({
        fullName: 'Ifeanyi Okeke',
        relationship: 'father',
        login: { kind: 'username' },
      })
    )
  );
  return {
    ...env,
    motherId: mother.link.guardianId,
    fatherId: father.link.guardianId,
  };
};

describe('GuardianService payers and removal', () => {
  it('keeps one payer: unticking or removing the only payer answers 409', async () => {
    const { service, motherId } = await withTwo();

    await expect(
      service.updateLink(
        admin,
        { studentId: 'ada', guardianId: motherId },
        { paysFees: false }
      )
    ).rejects.toThrow('At least one guardian must pay the school fees.');
    await expect(
      service.unlink(admin, { studentId: 'ada', guardianId: motherId })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets the payer change once another guardian pays', async () => {
    const { service, motherId, fatherId } = await withTwo();
    await service.updateLink(
      admin,
      { studentId: 'ada', guardianId: fatherId },
      { paysFees: true }
    );

    const link = await service.updateLink(
      admin,
      { studentId: 'ada', guardianId: motherId },
      { paysFees: false, relationship: 'guardian' }
    );

    expect(link).toMatchObject({ paysFees: false, relationship: 'guardian' });
  });

  it('removes a non-payer, strips the guardian role with the last child and keeps the guardian row', async () => {
    const { service, tx, fatherId } = await withTwo();
    const userId = tx.guardians.get(fatherId)?.userId ?? '';

    await service.unlink(admin, { studentId: 'ada', guardianId: fatherId });

    expect(tx.guardians.has(fatherId)).toBe(true);
    expect(tx.rolesOf(ORG, userId)).toBeUndefined();
    expect(tx.activity.at(-1)?.text).toBe(
      'Ifeanyi Okeke unlinked from Ada Okeke.'
    );
  });

  it('keeps the member row of a staff guardian and drops only the guardian role', async () => {
    const { service, tx, repository } = setup();
    tx.users.set('teacher-1', {
      id: 'teacher-1',
      email: 'ngozi@example.com',
      username: null,
      passwordHash: 'old',
    });
    tx.members.set(`${ORG}:teacher-1`, ['teacher']);
    const mother = await service.link(admin, 'ada', asDraft(newGuardian()));
    const other = await service.link(
      admin,
      'ada',
      asDraft(newGuardian({ fullName: 'B', login: { kind: 'username' } }))
    );
    await service.updateLink(
      admin,
      { studentId: 'ada', guardianId: other.link.guardianId },
      { paysFees: true }
    );

    await service.unlink(admin, {
      studentId: 'ada',
      guardianId: mother.link.guardianId,
    });

    expect(tx.rolesOf(ORG, 'teacher-1')).toEqual(['teacher']);
    expect(repository.tx).toBe(tx);
  });

  it('refuses removing the last guardian of a student on the roll while one is required, but not for a leaver', async () => {
    const { service, tx } = setup();
    const only = await service.link(admin, 'ada', asDraft(newGuardian()));

    await expect(
      service.unlink(admin, {
        studentId: 'ada',
        guardianId: only.link.guardianId,
      })
    ).rejects.toBeInstanceOf(ConflictException);
    const ada = tx.students.get(`${ORG}:ada`);
    if (ada !== undefined) {
      ada.onRoll = false;
    }
    await expect(
      service.unlink(admin, {
        studentId: 'ada',
        guardianId: only.link.guardianId,
      })
    ).resolves.toEqual({ studentId: 'ada', guardianId: only.link.guardianId });
  });

  it('allows removing the last guardian when none is required', async () => {
    const { service, tx } = setup();
    tx.schoolRules = { maxGuardians: 4, requireGuardian: false };
    const only = await service.link(admin, 'ada', asDraft(newGuardian()));

    await expect(
      service.unlink(admin, {
        studentId: 'ada',
        guardianId: only.link.guardianId,
      })
    ).resolves.toBeDefined();
  });
});

const guardianEnv = async () => {
  const env = setup();
  const created = await env.service.link(
    admin,
    'ada',
    asDraft(newGuardian({ login: { kind: 'username' } }))
  );
  env.repository.visibleGuardianIds.add(created.link.guardianId);
  return { ...env, guardianId: created.link.guardianId };
};

const passwordOf = (tx: ReturnType<typeof setup>['tx'], guardianId: string) =>
  tx.users.get(tx.guardians.get(guardianId)?.userId ?? '')?.passwordHash;

describe('GuardianService.resetLogin', () => {
  it('resets a guardian-only login, returns the password and logs it without the password', async () => {
    const { service, tx, guardianId } = await guardianEnv();

    const result = await service.resetLogin(admin, guardianId);

    expect(result).toEqual({
      username: 'ngozi-okeke-family',
      temporaryPassword: expect.any(String),
    });
    expect(passwordOf(tx, guardianId)).toBe(`hash:${result.temporaryPassword}`);
    expect(tx.activity.at(-1)).toMatchObject({
      kind: 'guardian.login_reset',
      text: 'Tunde reset Ngozi Okeke’s login.',
    });
    expect(JSON.stringify(tx.activity.at(-1))).not.toContain(
      result.temporaryPassword
    );
  });

  it('answers 409 and keeps the password when the guardian is also staff here', async () => {
    const { service, tx, guardianId } = await guardianEnv();
    const userId = tx.guardians.get(guardianId)?.userId ?? '';
    const before = passwordOf(tx, guardianId);
    tx.members.set(`${ORG}:${userId}`, ['teacher', 'guardian']);

    await expect(service.resetLogin(admin, guardianId)).rejects.toThrow(
      GUARDIAN_STAFF_RESET_MESSAGE
    );
    expect(passwordOf(tx, guardianId)).toBe(before);
  });

  it('answers 409 and keeps the password when the login belongs to another school', async () => {
    const { service, tx, guardianId } = await guardianEnv();
    const userId = tx.guardians.get(guardianId)?.userId ?? '';
    const before = passwordOf(tx, guardianId);
    tx.members.set(`school-b:${userId}`, ['owner']);

    await expect(service.resetLogin(admin, guardianId)).rejects.toThrow(
      GUARDIAN_SHARED_RESET_MESSAGE
    );
    expect(passwordOf(tx, guardianId)).toBe(before);
    expect(tx.activity.at(-1)?.kind).not.toBe('guardian.login_reset');
  });

  it('answers 409 when another school holds the login only through a guardian row', async () => {
    const { service, tx, guardianId } = await guardianEnv();
    const userId = tx.guardians.get(guardianId)?.userId ?? '';
    const before = passwordOf(tx, guardianId);
    tx.guardians.set('guardian-b', {
      id: 'guardian-b',
      organizationId: 'school-b',
      fullName: 'Ngozi Okeke',
      phone: '08012345678',
      email: null,
      address: '4 Palm Close',
      photoFileId: null,
      userId,
      createdBy: 'staff-b',
    });

    await expect(service.resetLogin(admin, guardianId)).rejects.toThrow(
      GUARDIAN_SHARED_RESET_MESSAGE
    );
    expect(passwordOf(tx, guardianId)).toBe(before);
  });

  it('answers 409 and keeps the password when the login is a platform user', async () => {
    const { service, tx, guardianId } = await guardianEnv();
    const user = tx.users.get(tx.guardians.get(guardianId)?.userId ?? '');
    const before = passwordOf(tx, guardianId);
    if (user !== undefined) {
      user.platformRole = 'superadmin';
    }

    await expect(service.resetLogin(admin, guardianId)).rejects.toThrow(
      GUARDIAN_SHARED_RESET_MESSAGE
    );
    expect(passwordOf(tx, guardianId)).toBe(before);
  });

  it('answers 404 for a guardian the caller cannot see', async () => {
    const { service, repository, guardianId } = await guardianEnv();
    repository.visibleGuardianIds.clear();

    await expect(service.resetLogin(admin, guardianId)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

describe('GuardianService without guardian:read', () => {
  const writer = context('guardian:link', 'guardian:create', 'guardian:update');

  it('refuses link, link edit and profile edit with 403 so no contact data is returned', async () => {
    const { service, tx, guardianId } = await guardianEnv();
    const links = tx.links.length;

    await expect(
      service.link(writer, 'ada', asDraft(usernameGuardian('Chidi Eze')))
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updateLink(
        writer,
        { studentId: 'ada', guardianId },
        { relationship: 'father' }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(writer, guardianId, { phone: '08099999999' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.links).toHaveLength(links);
  });
});

describe('GuardianService.list and update', () => {
  it('passes the picker query through and answers 404 for an out-of-scope student to exclude', async () => {
    const { service, repository } = setup();
    repository.pickerAnswer = [
      { id: 'g-1', fullName: 'Ifeanyi Okeke', outsideScope: true },
    ];

    await expect(
      service.list(admin, { q: '0801', excludeStudentId: 'ada' })
    ).resolves.toEqual(repository.pickerAnswer);
    expect(repository.pickerQueries[0]).toMatchObject({
      q: '0801',
      excludeStudentId: 'ada',
    });
    repository.visibleStudentIds.clear();
    await expect(
      service.list(admin, { excludeStudentId: 'ada' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 400 for an unusable photo and discards the replaced one', async () => {
    const { service, repository, discarded, guardianId } = await (async () => {
      const env = setup();
      const created = await env.service.link(
        admin,
        'ada',
        asDraft(newGuardian())
      );
      env.repository.visibleGuardianIds.add(created.link.guardianId);
      return { ...env, guardianId: created.link.guardianId };
    })();
    repository.photoStatus = { status: 'unusable' };

    await expect(
      service.update(admin, guardianId, { photoFileId: crypto.randomUUID() })
    ).rejects.toBeInstanceOf(BadRequestException);
    repository.photoStatus = { status: 'changed', previousFileId: 'old-file' };
    await service.update(admin, guardianId, {
      photoFileId: null,
      phone: '0803',
    });
    expect(discarded).toEqual(['old-file']);
    expect(repository.updated).toEqual([{ phone: '0803' }]);
  });
});
