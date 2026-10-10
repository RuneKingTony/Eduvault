import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { MemberSummary, SchoolRoleEntry } from '@eduvault/api-contract';
import { toPermissionMap, type PermissionMap } from '@eduvault/policy';
import type { MemberAdminService, OrgContext } from '../../common/auth';
import type { CampusService } from '../campus/campus.service';
import {
  MembersRepository,
  type MemberListQuery,
  type MemberRecord,
} from './members.repository';
import { MembersService } from './members.service';

const ORG = 'school-a';
const LEKKI = 'campus-lekki';
const IKEJA = 'campus-ikeja';

const roleRows: SchoolRoleEntry[] = [
  {
    slug: 'administrator',
    label: 'Administrator',
    description: null,
    source: 'starter',
    permissions: toPermissionMap(['student:read', 'student:create']),
  },
  {
    slug: 'teacher',
    label: 'Teacher',
    description: null,
    source: 'starter',
    permissions: toPermissionMap(['student:read']),
  },
  {
    slug: 'principal',
    label: 'Principal',
    description: null,
    source: 'starter',
    permissions: toPermissionMap(['campus:readAll', 'student:read']),
  },
  {
    slug: 'front-desk',
    label: 'Front desk',
    description: null,
    source: 'custom',
    permissions: toPermissionMap(['schoolAccount:update']),
  },
  {
    slug: 'guardian',
    label: 'Guardian',
    description: null,
    source: 'starter',
    permissions: {},
  },
];

const person = (
  id: string,
  roles: string[],
  campusIds: string[] = [LEKKI]
): MemberRecord => ({
  id,
  userId: `user-${id}`,
  name: `Name ${id}`,
  email: `${id}@example.com`,
  username: null,
  title: 'New member',
  roles,
  campusIds,
});

class FakeMembers extends MembersRepository {
  constructor(readonly records: MemberRecord[]) {
    super();
  }

  list(_query: MemberListQuery) {
    return Promise.resolve({ items: this.records, total: this.records.length });
  }

  findById(organizationId: string, id: string) {
    return Promise.resolve(this.records.find((record) => record.id === id));
  }

  findByUser(organizationId: string, userId: string) {
    return Promise.resolve(
      this.records.find((record) => record.userId === userId)
    );
  }

  countOwners() {
    return Promise.resolve(
      this.records.filter((record) => record.roles.includes('owner')).length
    );
  }

  listRoles() {
    return Promise.resolve(roleRows);
  }
}

const context = (
  overrides: Partial<OrgContext> & { permissions?: PermissionMap } = {}
): OrgContext => ({
  user: { id: 'user-caller', email: 'caller@example.com', name: 'Caller' },
  organizationId: ORG,
  roles: ['administrator'],
  permissions: toPermissionMap([
    'member:read',
    'member:update',
    'member:delete',
    'student:read',
    'student:create',
    'campus:readAll',
  ]),
  isOwner: false,
  activeCampusId: null,
  campusScope: 'all',
  classScope: 'all',
  acting: null,
  headers: new Headers(),
  ...overrides,
});

const setup = (records: MemberRecord[]) => {
  const admin = {
    underSchoolLock: vi.fn((_: string, fn: () => Promise<unknown>) => fn()),
    findAccount: vi.fn(),
    createAccount: vi.fn(),
    deleteAccount: vi.fn(),
    addMember: vi.fn().mockResolvedValue(undefined),
    setRolesAndCampuses: vi.fn().mockResolvedValue(undefined),
    setCampuses: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
  };
  const campuses = {
    assertInScope: vi.fn((ctx: OrgContext, campusId: string) =>
      campusId.startsWith('foreign')
        ? Promise.reject(new NotFoundException('Campus not found'))
        : Promise.resolve()
    ),
  };
  const service = new MembersService(
    new FakeMembers(records),
    campuses as unknown as CampusService,
    admin as unknown as MemberAdminService
  );
  const writes = () => [
    admin.addMember,
    admin.setRolesAndCampuses,
    admin.setCampuses,
    admin.removeMember,
  ];
  return { service, admin, campuses, writes };
};

const rejection = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => 'resolved',
    (error: unknown) => error
  );

const noWrites = (writes: ReturnType<typeof setup>['writes']) => {
  for (const write of writes()) {
    expect(write).not.toHaveBeenCalled();
  }
};

const created = (member: MemberSummary) => ({
  user: { id: member.userId, email: member.email ?? '', name: member.name },
  temporaryPassword: 'temp-pass',
});

describe('roles', () => {
  it('lists owner and member, then starter, then custom roles by label', async () => {
    const { service } = setup([]);
    const roles = await service.roles(context());
    expect(roles.map((role) => role.slug)).toEqual([
      'owner',
      'member',
      'administrator',
      'guardian',
      'principal',
      'teacher',
      'front-desk',
    ]);
  });

  it('marks grantable from what the caller holds; owner is never grantable', async () => {
    const { service } = setup([]);
    const roles = await service.roles(context({ isOwner: true }));
    const grantable = Object.fromEntries(
      roles.map((role) => [role.slug, role.grantable])
    );
    expect(grantable).toMatchObject({
      owner: false,
      member: true,
      administrator: true,
      teacher: true,
      principal: true,
      'front-desk': false,
    });
  });
});

describe('updateRoles', () => {
  const target = person('t', ['member']);

  it('answers 404 for a member that is not visible, before anything else', async () => {
    const { service, writes } = setup([person('t', ['member'], [IKEJA])]);
    const caller = context({ campusScope: [LEKKI], isOwner: true });
    const error = await rejection(
      service.updateRoles(caller, 't', { roles: ['owner'] })
    );
    expect(error).toBeInstanceOf(NotFoundException);
    noWrites(writes);
  });

  it('answers 404 for an unknown role and for a campus out of scope', async () => {
    const { service, writes } = setup([target]);
    const unknown = await rejection(
      service.updateRoles(context(), 't', { roles: ['ghost'] })
    );
    expect(unknown).toBeInstanceOf(NotFoundException);
    const campus = await rejection(
      service.updateRoles(context(), 't', {
        roles: ['teacher'],
        campusIds: ['foreign-1'],
      })
    );
    expect(campus).toBeInstanceOf(NotFoundException);
    noWrites(writes);
  });

  it('refuses adding or removing owner as a handover, before the escalation check', async () => {
    const { service, writes } = setup([
      target,
      person('o', ['member', 'owner']),
    ]);
    const add = await rejection(
      service.updateRoles(context(), 't', { roles: ['owner'] })
    );
    const remove = await rejection(
      service.updateRoles(context(), 'o', { roles: [] })
    );
    for (const error of [add, remove]) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'OWNER_BY_HANDOVER',
      });
    }
    noWrites(writes);
  });

  it('names the role the caller cannot give out, then the one they cannot remove', async () => {
    const { service, writes } = setup([
      target,
      person('f', ['member', 'front-desk']),
    ]);
    const give = await rejection(
      service.updateRoles(context(), 't', {
        roles: ['front-desk', 'teacher'],
        campusIds: [LEKKI],
      })
    );
    expect(give).toBeInstanceOf(ForbiddenException);
    expect((give as ForbiddenException).message).toBe(
      'You can’t give out Front desk: it allows things you can’t do yourself.'
    );
    const remove = await rejection(
      service.updateRoles(context(), 'f', { roles: [], campusIds: [LEKKI] })
    );
    expect((remove as ForbiddenException).message).toBe(
      'You can’t remove Front desk: it allows things you can’t do yourself.'
    );
    noWrites(writes);
  });

  it('checks the escalation before the role combination', async () => {
    const { service } = setup([person('s', ['member', 'student'])]);
    const error = await rejection(
      service.updateRoles(context({ permissions: {} }), 's', {
        roles: ['student', 'front-desk'],
      })
    );
    expect(error).toBeInstanceOf(ForbiddenException);
  });

  it('refuses an invalid combination with ROLE_COMBINATION', async () => {
    const { service, writes } = setup([person('g', ['member', 'guardian'])]);
    const error = await rejection(
      service.updateRoles(context(), 'g', {
        roles: ['guardian', 'teacher'],
        campusIds: [LEKKI],
      })
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'ROLE_COMBINATION',
      message:
        'Name g is a portal user (student or guardian) and can’t be given Teacher.',
    });
    noWrites(writes);
  });

  it('asks for a campus when the draft does not reach every campus', async () => {
    const { service, writes } = setup([target]);
    const error = await rejection(
      service.updateRoles(context(), 't', { roles: ['teacher'] })
    );
    expect((error as Error).message).toBe('Choose at least one campus.');
    noWrites(writes);
  });

  it('writes the draft with member kept and only the campus difference', async () => {
    const { service, admin } = setup([person('t', ['member'], [LEKKI])]);
    await service.updateRoles(context(), 't', {
      roles: ['teacher'],
      campusIds: [IKEJA],
    });
    expect(admin.setRolesAndCampuses).toHaveBeenCalledWith({
      memberId: 't',
      userId: 'user-t',
      roles: ['member', 'teacher'],
      addCampusIds: [IKEJA],
      removeCampusIds: [LEKKI],
    });
  });

  it('needs no campus for a draft that holds campus:readAll', async () => {
    const { service, admin } = setup([target]);
    await service.updateRoles(context(), 't', { roles: ['principal'] });
    expect(admin.setRolesAndCampuses).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['member', 'principal'],
        addCampusIds: [],
        removeCampusIds: [],
      })
    );
  });
});

describe('updateCampuses', () => {
  it('keeps campuses the editor cannot see when merging the set', async () => {
    const { service, admin } = setup([person('t', ['member'], [LEKKI, IKEJA])]);
    await service.updateCampuses(context({ campusScope: [LEKKI] }), 't', {
      campusIds: [LEKKI, 'campus-vi'],
    });
    expect(admin.setCampuses).toHaveBeenCalledWith({
      userId: 'user-t',
      addCampusIds: ['campus-vi'],
      removeCampusIds: [],
    });
  });

  it('removes a visible campus left out of the set', async () => {
    const { service, admin } = setup([person('t', ['member'], [LEKKI, IKEJA])]);
    await service.updateCampuses(context(), 't', { campusIds: [LEKKI] });
    expect(admin.setCampuses).toHaveBeenCalledWith({
      userId: 'user-t',
      addCampusIds: [],
      removeCampusIds: [IKEJA],
    });
  });

  it('answers 404 for a campus out of scope and writes nothing', async () => {
    const { service, writes } = setup([person('t', ['member'])]);
    const error = await rejection(
      service.updateCampuses(context(), 't', { campusIds: ['foreign-1'] })
    );
    expect(error).toBeInstanceOf(NotFoundException);
    noWrites(writes);
  });

  it('shows only the viewer’s campuses in the response', async () => {
    const { service } = setup([person('t', ['member'], [LEKKI, IKEJA])]);
    const detail = await service.updateCampuses(
      context({ campusScope: [LEKKI] }),
      't',
      { campusIds: [LEKKI] }
    );
    expect(detail.campusIds).toEqual([LEKKI]);
  });
});

describe('remove', () => {
  it('checks 404, then LAST_OWNER, then SELF_REMOVAL, then escalation', async () => {
    const { service, writes } = setup([
      person('o', ['member', 'owner']),
      person('self', ['member', 'administrator']),
      person('fd', ['member', 'front-desk']),
    ]);
    const missing = await rejection(service.remove(context(), 'nope'));
    expect(missing).toBeInstanceOf(NotFoundException);

    const lastOwner = await rejection(
      service.remove(context({ isOwner: true }), 'o')
    );
    expect((lastOwner as ConflictException).getResponse()).toMatchObject({
      code: 'LAST_OWNER',
    });

    const selfCaller = context({
      user: { id: 'user-self', email: 's@example.com', name: 'Self' },
    });
    const self = await rejection(service.remove(selfCaller, 'self'));
    expect((self as ConflictException).getResponse()).toMatchObject({
      code: 'SELF_REMOVAL',
    });

    const escalation = await rejection(service.remove(context(), 'fd'));
    expect(escalation).toBeInstanceOf(ForbiddenException);
    expect((escalation as ForbiddenException).message).toContain('Front desk');
    noWrites(writes);
  });

  it('refuses a campus-scoped remover when the member also works on campuses they cannot see', async () => {
    const { service, admin } = setup([
      person('both', ['member', 'teacher'], [LEKKI, IKEJA]),
      person('lekki', ['member', 'teacher'], [LEKKI]),
    ]);
    const scoped = context({ campusScope: [LEKKI] });

    const error = await rejection(service.remove(scoped, 'both'));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(admin.removeMember).not.toHaveBeenCalled();

    await service.remove(scoped, 'lekki');
    expect(admin.removeMember).toHaveBeenCalledOnce();
  });

  it('lets an owner remove a second owner', async () => {
    const { service, admin } = setup([
      person('o1', ['member', 'owner']),
      person('o2', ['member', 'owner']),
    ]);
    await service.remove(context({ isOwner: true }), 'o2');
    expect(admin.removeMember).toHaveBeenCalledWith({
      memberId: 'o2',
      organizationId: ORG,
      userId: 'user-o2',
    });
  });

  it('refuses an administrator removing an owner', async () => {
    const { service, writes } = setup([
      person('o1', ['member', 'owner']),
      person('o2', ['member', 'owner']),
    ]);
    const error = await rejection(service.remove(context(), 'o2'));
    expect(error).toBeInstanceOf(ForbiddenException);
    noWrites(writes);
  });
});

describe('create', () => {
  const input = {
    name: 'New Person',
    email: 'new@example.com',
    campusIds: [LEKKI],
  };
  it('deletes the account it created when the add fails', async () => {
    const { service, admin } = setup([]);
    admin.findAccount.mockResolvedValue(undefined);
    admin.createAccount.mockResolvedValue(created(person('n', [])));
    admin.addMember.mockRejectedValue(new Error('db down'));
    const error = await rejection(service.create(context(), input));
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(admin.deleteAccount).toHaveBeenCalledWith('user-n');
  });

  it('keeps an existing account when the add fails', async () => {
    const { service, admin } = setup([]);
    admin.findAccount.mockResolvedValue({
      id: 'user-existing',
      email: input.email,
      name: 'Existing',
      isSuperAdmin: false,
    });
    admin.addMember.mockRejectedValue(new Error('db down'));
    await rejection(service.create(context(), input));
    expect(admin.createAccount).not.toHaveBeenCalled();
    expect(admin.deleteAccount).not.toHaveBeenCalled();
  });

  it('answers 409 for a super admin and for someone already on the list', async () => {
    const { service, admin } = setup([person('x', ['member'])]);
    admin.findAccount.mockResolvedValueOnce({
      id: 'user-root',
      email: input.email,
      name: 'Root',
      isSuperAdmin: true,
    });
    const superAdmin = await rejection(service.create(context(), input));
    expect((superAdmin as ConflictException).message).toBe(
      'new@example.com can’t be added to this school.'
    );
    admin.findAccount.mockResolvedValueOnce({
      id: 'user-x',
      email: input.email,
      name: 'X',
      isSuperAdmin: false,
    });
    const duplicate = await rejection(service.create(context(), input));
    expect((duplicate as ConflictException).message).toBe(
      'new@example.com is already on the staff list.'
    );
    expect(admin.addMember).not.toHaveBeenCalled();
  });

  it('adds an existing account with no temporary password and the default title', async () => {
    const records: MemberRecord[] = [];
    const { service, admin } = setup(records);
    admin.findAccount.mockResolvedValue({
      id: 'user-n',
      email: input.email,
      name: 'Existing',
      isSuperAdmin: false,
    });
    admin.addMember.mockImplementation(() => {
      records.push(person('n', ['member']));
      return Promise.resolve();
    });
    const result = await service.create(context(), { ...input, title: '' });
    expect(result.temporaryPassword).toBeNull();
    expect(admin.addMember).toHaveBeenCalledWith({
      organizationId: ORG,
      userId: 'user-n',
      title: 'New member',
      campusIds: [LEKKI],
    });
  });

  it('answers 404 for a campus out of scope before touching accounts', async () => {
    const { service, admin } = setup([]);
    const error = await rejection(
      service.create(context(), { ...input, campusIds: ['foreign-1'] })
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(admin.findAccount).not.toHaveBeenCalled();
  });
});

describe('get', () => {
  it('answers 404 for a member on none of the viewer’s campuses', async () => {
    const { service } = setup([person('t', ['member'], [IKEJA])]);
    const error = await rejection(
      service.get(context({ campusScope: [LEKKI] }), 't')
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe('Member not found');
  });

  it('returns combined permissions and the campus scope', async () => {
    const { service } = setup([
      person('t', ['member', 'teacher', 'principal'], [LEKKI, IKEJA]),
    ]);
    const detail = await service.get(context(), 't');
    expect(detail.permissions).toEqual({
      student: ['read'],
      campus: ['readAll'],
    });
    expect(detail.campusScope).toBe('all');
    expect(detail.classScope).toBe('all');
  });

  it('marks only the school’s sole owner as the last owner', async () => {
    const sole = setup([
      person('o1', ['member', 'owner']),
      person('t', ['member']),
    ]);
    expect((await sole.service.get(context(), 'o1')).lastOwner).toBe(true);
    expect((await sole.service.get(context(), 't')).lastOwner).toBe(false);

    const pair = setup([
      person('o1', ['member', 'owner']),
      person('o2', ['member', 'owner']),
    ]);
    expect((await pair.service.get(context(), 'o1')).lastOwner).toBe(false);
  });
});
