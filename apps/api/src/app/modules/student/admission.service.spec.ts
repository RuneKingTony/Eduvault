import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type {
  AdmitStudent,
  GuardianDraftInput,
  StudentDetail,
} from '@eduvault/api-contract';
import type { AccountService, OrgContext } from '../../common/auth';
import {
  AdmissionRepository,
  type AdmissionClass,
  type AdmissionOutcome,
  type AdmissionWrite,
  type CurrentTerm,
  type DuplicateMatch,
} from './admission.repository';
import { AdmissionService } from './admission.service';
import type { StudentService } from './student.service';

const ORG = 'school-a';

const fakeHash = (password: string): string => {
  let reversed = '';
  for (const char of password) {
    reversed = char + reversed;
  }
  return `hash:${reversed}`;
};
const ARM = '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11';
const EXISTING = '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22';

const term: CurrentTerm = {
  termId: 'term-1',
  termName: 'First term',
  sessionId: 'session-1',
  sessionName: '2026/2027',
};

const arm: AdmissionClass = {
  id: ARM,
  levelId: 'level-8',
  levelName: 'JSS 2',
  name: 'Gold',
  campusId: 'lekki',
  campusName: 'Lekki',
};

class FakeAdmissions extends AdmissionRepository {
  term: CurrentTerm | undefined = term;
  classes_: AdmissionClass[] = [arm];
  maxGuardians = 2;
  requireGuardian = true;
  known = new Set<string>([EXISTING]);
  matches: DuplicateMatch[] = [];
  writes: AdmissionWrite[] = [];
  newLogin = true;
  currentDay = '2026-10-11';

  today() {
    return this.currentDay;
  }

  currentTerm() {
    return Promise.resolve(this.term);
  }

  next: { id: string; name: string } | undefined = {
    id: 'term-2',
    name: 'Second term',
  };

  nextTerm() {
    return Promise.resolve(this.next);
  }

  rules() {
    return Promise.resolve({
      maxGuardians: this.maxGuardians,
      requireGuardian: this.requireGuardian,
    });
  }

  school() {
    return Promise.resolve({ prefix: 'GF', slug: 'greenfield' });
  }

  nextNumber() {
    return Promise.resolve(234);
  }

  classes() {
    return Promise.resolve(this.classes_);
  }

  findClass(_org: string, input: { classArmId: string }) {
    return Promise.resolve(
      this.classes_.find((candidate) => candidate.id === input.classArmId)
    );
  }

  guardiansInSchool(_org: string, ids: readonly string[]) {
    return Promise.resolve(ids.filter((id) => this.known.has(id)));
  }

  duplicates() {
    return Promise.resolve(this.matches);
  }

  admit(write: AdmissionWrite): Promise<AdmissionOutcome> {
    this.writes.push(write);
    return Promise.resolve({
      studentId: 'student-1',
      admissionNumber: 'GF-0234',
      studentUsername: 'greenfield-0234',
      guardians: write.guardians.map((draft, index) =>
        draft.kind === 'existing'
          ? {
              guardianId: draft.guardianId,
              name: 'Ifeanyi Okeke',
              relationship: draft.relationship,
              isNew: false,
              newLogin: false,
              email: null,
              username: null,
            }
          : {
              guardianId: `guardian-${index}`,
              name: draft.guardian.fullName,
              relationship: draft.guardian.relationship,
              isNew: true,
              newLogin: this.newLogin,
              email:
                draft.guardian.login.kind === 'email'
                  ? draft.guardian.login.email
                  : null,
              username:
                draft.guardian.login.kind === 'username' ? 'udoh-family' : null,
            }
      ),
    });
  }
}

const context = (...permissions: Permission[]): OrgContext => ({
  user: { id: 'staff-1', email: 'admin@example.com', name: 'Tunde' },
  organizationId: ORG,
  roles: ['administrator'],
  permissions: toPermissionMap(permissions),
  isOwner: false,
  activeCampusId: null,
  campusScope: 'all',
  classScope: 'all',
  studentScope: [],
  acting: null,
  headers: new Headers(),
});

const admin = context('student:create', 'guardian:link', 'guardian:create');
const linkOnly = context('student:create', 'guardian:link');
const bare = context('student:create');

const setup = () => {
  const admissions = new FakeAdmissions();
  const accounts = {
    hashPassword: (password: string) => Promise.resolve(fakeHash(password)),
  } as unknown as AccountService;
  const students = {
    getAdmitted: () => Promise.resolve({ id: 'student-1' } as StudentDetail),
  } as unknown as StudentService;
  return {
    admissions,
    service: new AdmissionService(admissions, students, accounts),
  };
};

const fresh = {
  fullName: 'Mrs Udoh',
  phone: '08012345678',
  address: '4 Palm Close',
  relationship: 'mother',
  login: { kind: 'username' },
};

const input = (
  overrides: Record<string, unknown> = {},
  guardians: GuardianDraftInput[] = [{ new: fresh } as GuardianDraftInput]
) =>
  ({
    firstName: 'Peace',
    lastName: 'Udoh',
    gender: 'F',
    dateOfBirth: '2014-03-03',
    classArmId: ARM,
    guardians,
    ...overrides,
  }) as unknown as AdmitStudent;

const draft = (id: string) =>
  ({
    existingGuardianId: id,
    relationship: 'father',
  }) as GuardianDraftInput;

const firstNewHash = (write: AdmissionWrite | undefined): string => {
  const first = write?.guardians[0];
  return first?.kind === 'new' ? first.passwordHash : '';
};

const payersOf = (write: AdmissionWrite | undefined) =>
  write?.guardians.map((guardian) =>
    guardian.kind === 'new' ? guardian.guardian.paysFees : guardian.paysFees
  );

describe('AdmissionService.admit validation order', () => {
  it('refuses a date of birth after today before anything else', async () => {
    const { admissions, service } = setup();
    admissions.term = undefined;

    await expect(
      service.admit(admin, input({ dateOfBirth: '2026-10-12' }))
    ).rejects.toThrow('Choose a date of birth on or before today.');
    expect(admissions.writes).toHaveLength(0);
  });

  it('answers 409 with no current term, before it looks at the class', async () => {
    const { admissions, service } = setup();
    admissions.term = undefined;

    await expect(
      service.admit(admin, input({ classArmId: crypto.randomUUID() }))
    ).rejects.toThrow('Set a current term before admitting students.');
    await expect(
      service.admit(admin, input({ classArmId: crypto.randomUUID() }))
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 404 "Class not found" for an arm outside the school, scope or active set', async () => {
    const { admissions, service } = setup();
    admissions.classes_ = [];

    await expect(service.admit(admin, input())).rejects.toMatchObject({
      response: { message: 'Class not found' },
    });
    await expect(service.admit(admin, input())).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 400 over the maximum and 400 for none while one is required', async () => {
    const { admissions, service } = setup();
    admissions.maxGuardians = 1;

    await expect(
      service.admit(
        admin,
        input({}, [
          { new: fresh },
          { new: { ...fresh, fullName: 'B' } },
        ] as GuardianDraftInput[])
      )
    ).rejects.toThrow('A student can have at most 1 guardian.');
    await expect(service.admit(admin, input({}, []))).rejects.toThrow(
      'Add at least one guardian, or switch off “Guardian needed to admit” in Admissions rules.'
    );
    expect(admissions.writes).toHaveLength(0);
  });

  it('admits with no guardian when none is required', async () => {
    const { admissions, service } = setup();
    admissions.requireGuardian = false;

    const result = await service.admit(bare, input({}, []));

    expect(admissions.writes[0]?.guardians).toEqual([]);
    expect(result.logins).toHaveLength(1);
  });
});

describe('AdmissionService.admit term', () => {
  it('places in the current term when no term is named or the current one is', async () => {
    const { admissions, service } = setup();

    await service.admit(admin, input());
    await service.admit(admin, input({ termId: 'term-1' }));

    expect(admissions.writes.map((write) => write.term.termId)).toEqual([
      'term-1',
      'term-1',
    ]);
    expect(admissions.writes.map((write) => write.startsLater)).toEqual([
      false,
      false,
    ]);
  });

  it('places in the next term of the same session when it is named', async () => {
    const { admissions, service } = setup();

    await service.admit(admin, input({ termId: 'term-2' }));

    expect(admissions.writes[0]).toMatchObject({
      startsLater: true,
      term: {
        termId: 'term-2',
        termName: 'Second term',
        sessionId: 'session-1',
        sessionName: '2026/2027',
      },
    });
  });

  it('answers 400 for any other term, and for the next term when there is none', async () => {
    const { admissions, service } = setup();

    await expect(
      service.admit(admin, input({ termId: crypto.randomUUID() }))
    ).rejects.toThrow('Choose the current term or the next term.');
    admissions.next = undefined;
    await expect(
      service.admit(admin, input({ termId: 'term-2' }))
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(admissions.writes).toHaveLength(0);
  });

  it('offers the next term in the preview, or null in the last term of the year', async () => {
    const { admissions, service } = setup();

    expect((await service.preview(admin)).nextTerm).toEqual({
      id: 'term-2',
      name: 'Second term',
    });
    admissions.next = undefined;
    expect((await service.preview(admin)).nextTerm).toBeNull();
  });
});

describe('AdmissionService.admit permission matrix', () => {
  it('answers 403 and writes nothing for guardians without guardian:link', async () => {
    const { admissions, service } = setup();

    await expect(service.admit(bare, input())).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(admissions.writes).toHaveLength(0);
  });

  it('answers 403 for a new guardian without guardian:create but allows an existing one', async () => {
    const { admissions, service } = setup();
    const existing = {
      existingGuardianId: EXISTING,
      relationship: 'father',
    } as GuardianDraftInput;

    await expect(service.admit(linkOnly, input())).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await service.admit(linkOnly, input({}, [existing]));
    expect(admissions.writes).toHaveLength(1);
  });

  it('answers 404 for an unknown existing guardian and 400 for the same one twice', async () => {
    const { service } = setup();
    await expect(
      service.admit(admin, input({}, [draft(crypto.randomUUID())]))
    ).rejects.toThrow('Guardian not found');
    await expect(
      service.admit(admin, input({}, [draft(EXISTING), draft(EXISTING)]))
    ).rejects.toThrow('The same guardian is chosen twice.');
  });
});

describe('AdmissionService.admit write', () => {
  it('makes the first guardian the payer when none is ticked and keeps an explicit payer', async () => {
    const { admissions, service } = setup();
    const second = {
      new: { ...fresh, fullName: 'Bayo' },
    } as GuardianDraftInput;

    await service.admit(
      admin,
      input({}, [{ new: fresh }, second] as GuardianDraftInput[])
    );
    await service.admit(
      admin,
      input({}, [
        { new: fresh },
        { new: { ...fresh, fullName: 'Bayo', paysFees: true } },
      ] as GuardianDraftInput[])
    );

    expect(payersOf(admissions.writes[0])).toEqual([true, false]);
    expect(payersOf(admissions.writes[1])).toEqual([false, true]);
  });

  it('hands the repository hashes, never plain passwords, and returns the plain ones once', async () => {
    const { admissions, service } = setup();

    const result = await service.admit(admin, input());

    const write = admissions.writes[0];
    expect(write?.studentPasswordHash.startsWith('hash:')).toBe(true);
    const [student, guardian] = result.logins;
    expect(student).toMatchObject({
      who: 'student',
      name: 'Peace Udoh',
      username: 'greenfield-0234',
      existing: false,
    });
    expect(fakeHash(student?.temporaryPassword ?? '')).toBe(
      write?.studentPasswordHash
    );
    expect(guardian).toMatchObject({
      who: 'guardian',
      name: 'Mrs Udoh',
      username: 'udoh-family',
      relationship: 'mother',
      existing: false,
    });
    expect(fakeHash(guardian?.temporaryPassword ?? '')).toBe(
      firstNewHash(write)
    );
    expect(JSON.stringify(write)).not.toContain(
      student?.temporaryPassword ?? 'x'
    );
  });

  it('lists a reused login with no password and leaves existing guardians out', async () => {
    const { admissions, service } = setup();
    admissions.newLogin = false;
    const existing = {
      existingGuardianId: EXISTING,
      relationship: 'father',
    } as GuardianDraftInput;
    const withEmail = {
      new: { ...fresh, login: { kind: 'email', email: 'udoh@example.com' } },
    } as GuardianDraftInput;

    const result = await service.admit(admin, input({}, [withEmail, existing]));

    expect(result.logins).toHaveLength(2);
    expect(result.logins[1]).toMatchObject({
      email: 'udoh@example.com',
      existing: true,
    });
    expect(result.logins[1]?.temporaryPassword).toBeUndefined();
  });
});

describe('AdmissionService.preview and duplicates', () => {
  it('previews the next number and username without taking them, with the class labels', async () => {
    const { service } = setup();

    await expect(service.preview(admin)).resolves.toEqual({
      nextAdmissionNumber: 'GF-0234',
      nextStudentUsername: 'greenfield-0234',
      currentTerm: { id: 'term-1', name: 'First term' },
      currentSession: { id: 'session-1', name: '2026/2027' },
      nextTerm: { id: 'term-2', name: 'Second term' },
      maxGuardians: 2,
      requireGuardian: true,
      classes: [{ id: ARM, label: 'JSS 2 Gold · Lekki', campusId: 'lekki' }],
    });
  });

  it('answers 409 for a preview with no current term', async () => {
    const { admissions, service } = setup();
    admissions.term = undefined;

    await expect(service.preview(admin)).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('names the state and hides the id and number of a match outside the scope', async () => {
    const { admissions, service } = setup();
    admissions.matches = [
      {
        studentId: 'in',
        firstName: 'Ada',
        lastName: 'Okeke',
        admissionNumber: 'GF-0001',
        notSeenSince: null,
        exitKind: null,
        inScope: true,
      },
      {
        studentId: 'out',
        firstName: 'Ada',
        lastName: 'Okeke',
        admissionNumber: 'GF-0002',
        notSeenSince: null,
        exitKind: 'left',
        inScope: false,
      },
    ];

    const result = await service.duplicates(admin, {
      firstName: 'Ada',
      lastName: 'Okeke',
      dateOfBirth: '2014-03-03',
    });

    expect(result.matches).toEqual([
      {
        name: 'Ada Okeke',
        state: 'Active',
        studentId: 'in',
        admissionNumber: 'GF-0001',
      },
      { name: 'Ada Okeke', state: 'Left' },
    ]);
  });
});

describe('BadRequest type', () => {
  it('is what a bad guardian count throws', async () => {
    const { admissions, service } = setup();
    admissions.maxGuardians = 1;

    await expect(
      service.admit(
        admin,
        input({}, [{ new: fresh }, { new: fresh }] as GuardianDraftInput[])
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
