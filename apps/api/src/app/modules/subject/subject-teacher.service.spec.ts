import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import type { SchoolLock } from '../../common/db/school-lock';
import type { ClassRef, ClassService } from '../class/class.service';
import { FakeSubjectRepository } from './fake-subject.repository';
import { SubjectTeacherService } from './subject-teacher.service';

const ctxFor = (
  permissions: Permission[],
  overrides: Partial<OrgContext> = {}
) =>
  ({
    organizationId: 'school-a',
    user: { id: 'admin', email: 'a@eduvault.test', name: 'Admin' },
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
    classScope: 'all',
    ...overrides,
  }) as OrgContext;

const admin = ctxFor([
  'class:read',
  'class:readAll',
  'class:assignTeacher',
  'subject:read',
]);

interface StubMember {
  userId: string;
  name: string;
  candidate: boolean;
}

function classServiceStub() {
  const classes: ClassRef[] = [
    {
      id: 'gold',
      displayName: 'JSS 2 Gold',
      levelId: 'jss2',
      campusId: 'lekki',
      campusName: 'Lekki',
      retiredAt: null,
    },
    {
      id: 'silver',
      displayName: 'JSS 2 Silver',
      levelId: 'jss2',
      campusId: 'lekki',
      campusName: 'Lekki',
      retiredAt: null,
    },
    {
      id: 'old',
      displayName: 'JSS 2 Old',
      levelId: 'jss2',
      campusId: 'lekki',
      campusName: 'Lekki',
      retiredAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const state = {
    members: [
      { userId: 'emeka', name: 'Emeka Obi', candidate: true },
      { userId: 'ayo', name: 'Ayo Bassey', candidate: true },
      { userId: 'chika', name: 'Chika Eze', candidate: false },
      { userId: 'tunde', name: 'Tunde Ola', candidate: false },
    ] as StubMember[],
  };
  const inScope = (ctx: OrgContext, record: ClassRef) =>
    (ctx.campusScope === 'all' || ctx.campusScope.includes(record.campusId)) &&
    (ctx.classScope === 'all' || ctx.classScope.includes(record.id));
  const service = {
    requireVisible: (ctx: OrgContext, id: string) => {
      const record = classes.find((entry) => entry.id === id);
      if (record === undefined || !inScope(ctx, record)) {
        return Promise.reject(new NotFoundException());
      }
      return Promise.resolve(record);
    },
    listVisible: (ctx: OrgContext) =>
      Promise.resolve(
        classes.filter(
          (record) => record.retiredAt === null && inScope(ctx, record)
        )
      ),
    checkTeacher: (_ctx: OrgContext, _campusId: string, userId: string) =>
      Promise.resolve(state.members.find((member) => member.userId === userId)),
    candidateIds: () =>
      Promise.resolve(
        new Set(
          state.members
            .filter((member) => member.candidate)
            .map((member) => member.userId)
        )
      ),
  };
  return { state, service: service as unknown as ClassService };
}

function setup() {
  const stub = classServiceStub();
  const repository = new FakeSubjectRepository();
  repository.levelCodes = { jss2: 'JSS2' };
  repository.levelSequence = { jss2: 1 };
  repository.arms = [
    { id: 'gold', levelId: 'jss2' },
    { id: 'silver', levelId: 'jss2' },
  ];
  repository.userNames = {
    emeka: 'Emeka Obi',
    ayo: 'Ayo Bassey',
    tunde: 'Tunde Ola',
  };
  repository.subjects = [
    { id: 'maths', code: 'MTH', name: 'Mathematics', retiredAt: null },
    { id: 'english', code: 'ENG', name: 'English', retiredAt: null },
    {
      id: 'agr',
      code: 'AGR',
      name: 'Agriculture',
      retiredAt: '2025-07-20T00:00:00.000Z',
    },
    { id: 'geo', code: 'GEO', name: 'Geography', retiredAt: null },
  ];
  repository.levelSubjects = [
    { classLevelId: 'jss2', subjectId: 'maths', kind: 'core', sequence: 1 },
    { classLevelId: 'jss2', subjectId: 'english', kind: 'core', sequence: 2 },
  ];
  repository.terms = [
    { id: 't1', name: 'First term', startsOn: '2026-09-01', current: false },
    { id: 't2', name: 'Second term', startsOn: '2027-01-05', current: true },
  ];
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  const service = new SubjectTeacherService(
    repository,
    stub.service,
    lock as unknown as SchoolLock
  );
  return { repository, members: stub.state, service };
}

describe('SubjectTeacherService assign', () => {
  it('assigns a candidate and replaces them on a second assign', async () => {
    const { repository, service } = setup();
    const first = await service.assign(
      admin,
      { classId: 'gold', subjectId: 'maths' },
      {
        userId: 'emeka',
      }
    );
    expect(first).toMatchObject({
      userId: 'emeka',
      name: 'Emeka Obi',
      termId: 't2',
    });
    await service.assign(
      admin,
      { classId: 'gold', subjectId: 'maths' },
      { userId: 'ayo' }
    );
    expect(repository.assignments).toHaveLength(1);
    expect(repository.assignments[0]?.userId).toBe('ayo');
  });

  it('answers 400 for a non-candidate, a retired subject and a subject off the level', async () => {
    const { service } = setup();
    await expect(
      service.assign(
        admin,
        { classId: 'gold', subjectId: 'maths' },
        { userId: 'chika' }
      )
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.assign(
        admin,
        { classId: 'gold', subjectId: 'agr' },
        { userId: 'emeka' }
      )
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.assign(
        admin,
        { classId: 'gold', subjectId: 'geo' },
        { userId: 'emeka' }
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('answers 404 for an unknown member, subject or class out of scope', async () => {
    const { service } = setup();
    await expect(
      service.assign(
        admin,
        { classId: 'gold', subjectId: 'maths' },
        { userId: 'nobody' }
      )
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.assign(
        admin,
        { classId: 'gold', subjectId: 'missing' },
        { userId: 'emeka' }
      )
    ).rejects.toThrow(NotFoundException);
    const lekkiOnly = ctxFor(['class:read', 'class:assignTeacher'], {
      campusScope: ['ikeja'],
    });
    await expect(
      service.assign(
        lekkiOnly,
        { classId: 'gold', subjectId: 'maths' },
        { userId: 'emeka' }
      )
    ).rejects.toThrow(NotFoundException);
  });

  it('answers 409 for an archived class and with no current term', async () => {
    const { repository, service } = setup();
    await expect(
      service.assign(
        admin,
        { classId: 'old', subjectId: 'maths' },
        { userId: 'emeka' }
      )
    ).rejects.toThrow(ConflictException);
    repository.terms = [];
    await expect(
      service.assign(
        admin,
        { classId: 'gold', subjectId: 'maths' },
        { userId: 'emeka' }
      )
    ).rejects.toThrow(ConflictException);
  });

  it('accepts a campus:readAll holder from another campus', async () => {
    const { members, service } = setup();
    const tunde = members.members.find((member) => member.userId === 'tunde');
    if (tunde !== undefined) {
      tunde.candidate = true;
    }
    const result = await service.assign(
      admin,
      { classId: 'gold', subjectId: 'maths' },
      {
        userId: 'tunde',
      }
    );
    expect(result.userId).toBe('tunde');
  });
});

describe('SubjectTeacherService remove', () => {
  it('removes only the current term row', async () => {
    const { repository, service } = setup();
    repository.assignments = [
      {
        classId: 'gold',
        subjectId: 'maths',
        termId: 't1',
        userId: 'emeka',
        assignedBy: 'x',
      },
      {
        classId: 'gold',
        subjectId: 'maths',
        termId: 't2',
        userId: 'ayo',
        assignedBy: 'x',
      },
    ];
    await service.remove(admin, 'gold', 'maths');
    expect(repository.assignments.map((row) => row.termId)).toEqual(['t1']);
    await expect(service.remove(admin, 'gold', 'maths')).rejects.toThrow(
      NotFoundException
    );
  });
});

describe('SubjectTeacherService list', () => {
  it('lists active arms in scope, with unassigned subjects and arms with no students', async () => {
    const { repository, service } = setup();
    repository.assignments = [
      {
        classId: 'gold',
        subjectId: 'maths',
        termId: 't2',
        userId: 'emeka',
        assignedBy: 'x',
      },
    ];
    const result = await service.list(admin);
    expect(result.term).toEqual({ id: 't2', name: 'Second term' });
    expect(result.arms.map((arm) => arm.displayName)).toEqual([
      'JSS 2 Gold',
      'JSS 2 Silver',
    ]);
    expect(
      result.arms[0]?.subjects.map((row) => row.teacher?.name ?? null)
    ).toEqual(['Emeka Obi', null]);
    expect(result.copyFrom).toBeNull();
  });

  it('shows a class-scoped teacher only their arms and offers the copy when last term has rows', async () => {
    const { repository, service } = setup();
    repository.assignments = [
      {
        classId: 'gold',
        subjectId: 'maths',
        termId: 't1',
        userId: 'emeka',
        assignedBy: 'x',
      },
    ];
    const teacher = ctxFor(['class:read', 'subject:read'], {
      classScope: ['silver'],
    });
    const result = await service.list(teacher);
    expect(result.arms.map((arm) => arm.classId)).toEqual(['silver']);
    expect(result.copyFrom).toBeNull();
    const withCopy = await service.list(admin);
    expect(withCopy.copyFrom).toEqual({ id: 't1', name: 'First term' });
  });

  it('is empty with no current term', async () => {
    const { repository, service } = setup();
    repository.terms = [];
    expect(await service.list(admin)).toEqual({
      term: null,
      arms: [],
      copyFrom: null,
    });
  });
});

describe('SubjectTeacherService copy', () => {
  it('fills empty subjects only and reports skipped rows', async () => {
    const { repository, service } = setup();
    repository.assignments = [
      {
        classId: 'gold',
        subjectId: 'maths',
        termId: 't1',
        userId: 'emeka',
        assignedBy: 'x',
      },
      {
        classId: 'gold',
        subjectId: 'english',
        termId: 't1',
        userId: 'chika',
        assignedBy: 'x',
      },
      {
        classId: 'silver',
        subjectId: 'maths',
        termId: 't1',
        userId: 'emeka',
        assignedBy: 'x',
      },
      {
        classId: 'silver',
        subjectId: 'geo',
        termId: 't1',
        userId: 'emeka',
        assignedBy: 'x',
      },
      {
        classId: 'silver',
        subjectId: 'maths',
        termId: 't2',
        userId: 'ayo',
        assignedBy: 'x',
      },
    ];
    const result = await service.copyFromPreviousTerm(admin);
    expect(result.from).toEqual({ id: 't1', name: 'First term' });
    expect(result.copied).toBe(1);
    expect(result.skipped).toEqual([
      { classId: 'gold', subjectId: 'english', reason: 'notCandidate' },
      { classId: 'silver', subjectId: 'geo', reason: 'subjectNotOnLevel' },
    ]);
    const silverMaths = repository.assignments.find(
      (row) =>
        row.classId === 'silver' &&
        row.subjectId === 'maths' &&
        row.termId === 't2'
    );
    expect(silverMaths?.userId).toBe('ayo');
  });

  it('answers 409 with no previous term', async () => {
    const { repository, service } = setup();
    repository.terms = [
      { id: 't2', name: 'Second term', startsOn: '2027-01-05', current: true },
    ];
    await expect(service.copyFromPreviousTerm(admin)).rejects.toThrow(
      ConflictException
    );
  });

  it('resolves the previous term across school years', async () => {
    const { repository, service } = setup();
    repository.terms = [
      {
        id: 'y1t3',
        name: 'Third term',
        startsOn: '2026-04-20',
        current: false,
      },
      {
        id: 'y1t1',
        name: 'First term',
        startsOn: '2025-09-01',
        current: false,
      },
      { id: 'y2t1', name: 'First term', startsOn: '2026-09-07', current: true },
    ];
    repository.assignments = [
      {
        classId: 'gold',
        subjectId: 'maths',
        termId: 'y1t3',
        userId: 'emeka',
        assignedBy: 'x',
      },
    ];
    const result = await service.copyFromPreviousTerm(admin);
    expect(result.from.id).toBe('y1t3');
    expect(result.copied).toBe(1);
  });
});
