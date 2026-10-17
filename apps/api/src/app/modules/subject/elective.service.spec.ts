import { BadRequestException, NotFoundException } from '@nestjs/common';
import { toPermissionMap } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import type { SchoolLock } from '../../common/db/school-lock';
import { ElectiveService } from './elective.service';
import { FakeSubjectRepository } from './fake-subject.repository';

const baseCtx = {
  organizationId: 'school-a',
  user: { id: 'caller', email: 'c@eduvault.test', name: 'Caller' },
  permissions: toPermissionMap(['subject:read', 'subject:update']),
  campusScope: 'all',
  classScope: 'all',
} as OrgContext;

const lekkiOnly = { ...baseCtx, campusScope: ['lekki'] } as OrgContext;
const teacherOfArm = { ...baseCtx, classScope: ['arm-1a'] } as OrgContext;

interface StudentSeed {
  id: string;
  name: string;
  admissionNumber: string;
  campusId: string;
  armId: string;
}

const student = (seed: StudentSeed) => ({
  ...seed,
  className: `Class ${seed.armId}`,
});

const enrol = (studentId: string, levelId: string, sessionId = 'year-1') => ({
  id: `e-${studentId}-${sessionId}`,
  studentId,
  sessionId,
  levelId,
});

const take = (studentId: string, subjectId: string) => ({
  enrollmentId: `e-${studentId}-year-1`,
  subjectId,
});

const takersOf = (repository: FakeSubjectRepository, subjectId: string) =>
  repository.takers
    .filter((taker) => taker.subjectId === subjectId)
    .map((taker) => taker.enrollmentId)
    .toSorted((a, b) => a.localeCompare(b));

interface SetOptions {
  ctx?: OrgContext;
  subjectId?: string;
}

const set = (
  service: ElectiveService,
  studentIds: string[],
  { ctx = baseCtx, subjectId = 'french' }: SetOptions = {}
) => service.set(ctx, subjectId, { sessionId: 'year-1', studentIds });

function setup() {
  const repository = new FakeSubjectRepository();
  repository.levelCodes = { jss1: 'JSS1', jss2: 'JSS2', jss3: 'JSS3' };
  repository.levelSequence = { jss1: 1, jss2: 2, jss3: 3 };
  repository.subjects = [
    { id: 'maths', code: 'MTH', name: 'Mathematics', retiredAt: null },
    { id: 'french', code: 'FRE', name: 'French', retiredAt: null },
    { id: 'music', code: 'MUS', name: 'Music', retiredAt: null },
  ];
  repository.levelSubjects = [
    { classLevelId: 'jss1', subjectId: 'maths', kind: 'core', sequence: 1 },
    {
      classLevelId: 'jss1',
      subjectId: 'french',
      kind: 'elective',
      sequence: 2,
    },
    { classLevelId: 'jss2', subjectId: 'maths', kind: 'core', sequence: 1 },
    { classLevelId: 'jss2', subjectId: 'french', kind: 'core', sequence: 2 },
    { classLevelId: 'jss2', subjectId: 'music', kind: 'elective', sequence: 3 },
  ];
  repository.sessions = [
    { id: 'year-1', name: '2025/2026' },
    { id: 'year-2', name: '2026/2027' },
  ];
  repository.currentSession = 'year-1';
  repository.students = [
    student({
      id: 'ada',
      name: 'Ada Obi',
      admissionNumber: 'GF-0001',
      campusId: 'lekki',
      armId: 'arm-1a',
    }),
    student({
      id: 'bola',
      name: 'Bola Eze',
      admissionNumber: 'GF-0002',
      campusId: 'ikeja',
      armId: 'arm-1b',
    }),
    student({
      id: 'chi',
      name: 'Chi Ude',
      admissionNumber: 'GF-0003',
      campusId: 'lekki',
      armId: 'arm-2a',
    }),
    student({
      id: 'dayo',
      name: 'Dayo Ola',
      admissionNumber: 'GF-0004',
      campusId: 'lekki',
      armId: 'arm-3a',
    }),
  ];
  repository.enrollments = [
    enrol('ada', 'jss1'),
    enrol('bola', 'jss1'),
    enrol('chi', 'jss2'),
    enrol('dayo', 'jss3'),
  ];
  const lock = { run: (_org: string, fn: () => Promise<unknown>) => fn() };
  const service = new ElectiveService(
    repository,
    lock as unknown as SchoolLock
  );
  return { repository, service };
}

describe('ElectiveService list', () => {
  it('lists each elective with its takers and the candidate students', async () => {
    const { repository, service } = setup();
    repository.takers = [take('ada', 'french'), take('chi', 'music')];
    const result = await service.list(baseCtx, {});
    expect(result.session).toEqual({ id: 'year-1', name: '2025/2026' });
    expect(result.electives).toEqual([
      { subjectId: 'french', studentIds: ['ada'] },
      { subjectId: 'music', studentIds: ['chi'] },
    ]);
    expect(result.students.map((entry) => entry.id)).toEqual([
      'ada',
      'bola',
      'chi',
    ]);
    expect(result.students[0]).toEqual({
      id: 'ada',
      name: 'Ada Obi',
      admissionNumber: 'GF-0001',
      classId: 'arm-1a',
      className: 'Class arm-1a',
      classLevelId: 'jss1',
    });
  });

  it('narrows takers and students to the ones the caller can see', async () => {
    const { repository, service } = setup();
    repository.takers = [take('ada', 'french'), take('bola', 'french')];
    const lekki = await service.list(lekkiOnly, {});
    expect(lekki.electives[0]).toEqual({
      subjectId: 'french',
      studentIds: ['ada'],
    });
    expect(lekki.students.map((entry) => entry.id)).toEqual(['ada', 'chi']);
    const teacher = await service.list(teacherOfArm, {});
    expect(teacher.students.map((entry) => entry.id)).toEqual(['ada']);
    expect(teacher.electives[0]?.studentIds).toEqual(['ada']);
  });

  it('keeps an elective with no visible taker as an empty entry', async () => {
    const { repository, service } = setup();
    repository.takers = [take('bola', 'french')];
    const result = await service.list(lekkiOnly, {});
    expect(result.electives).toEqual([
      { subjectId: 'french', studentIds: [] },
      { subjectId: 'music', studentIds: [] },
    ]);
  });

  it('answers an empty list with no current term', async () => {
    const { repository, service } = setup();
    repository.currentSession = undefined;
    expect(await service.list(baseCtx, {})).toEqual({
      session: null,
      electives: [],
      students: [],
    });
  });

  it('answers 404 for a school year that is not the school’s', async () => {
    const { service } = setup();
    await expect(
      service.list(baseCtx, { sessionId: 'other-school-year' })
    ).rejects.toThrow(new NotFoundException('School year not found'));
  });

  it('starts a new school year with no takers', async () => {
    const { repository, service } = setup();
    repository.takers = [take('ada', 'french')];
    repository.enrollments.push(enrol('ada', 'jss1', 'year-2'));
    const result = await service.list(baseCtx, { sessionId: 'year-2' });
    expect(result.electives[0]).toEqual({
      subjectId: 'french',
      studentIds: [],
    });
    expect(result.students.map((entry) => entry.id)).toEqual(['ada']);
  });
});

describe('ElectiveService set', () => {
  it('adds and removes takers among the visible students', async () => {
    const { repository, service } = setup();
    repository.takers = [take('ada', 'french')];
    const saved = await set(service, ['bola']);
    expect(saved).toEqual({ subjectId: 'french', studentIds: ['bola'] });
    expect(takersOf(repository, 'french')).toEqual(['e-bola-year-1']);
  });

  it('leaves the row of a taker the caller cannot see untouched', async () => {
    const { repository, service } = setup();
    repository.takers = [take('bola', 'french')];
    await set(service, ['ada'], { ctx: lekkiOnly });
    expect(takersOf(repository, 'french')).toEqual([
      'e-ada-year-1',
      'e-bola-year-1',
    ]);
    await set(service, [], { ctx: lekkiOnly });
    expect(takersOf(repository, 'french')).toEqual(['e-bola-year-1']);
  });

  it('answers 400 for a student whose level has the subject as core', async () => {
    const { service } = setup();
    await expect(set(service, ['chi'])).rejects.toThrow(
      new BadRequestException('French is not an elective for Chi Ude’s level.')
    );
  });

  it('answers 400 for a student at a level without the subject', async () => {
    const { service } = setup();
    await expect(set(service, ['dayo'])).rejects.toThrow(BadRequestException);
  });

  it('answers 400 for a student with no enrolment that school year', async () => {
    const { repository, service } = setup();
    repository.enrollments = repository.enrollments.filter(
      (entry) => entry.studentId !== 'ada'
    );
    await expect(set(service, ['ada'])).rejects.toThrow(
      new BadRequestException('Ada Obi is not enrolled in that school year.')
    );
  });

  it('answers 404 for a student the caller cannot see', async () => {
    const { repository, service } = setup();
    await expect(set(service, ['bola'], { ctx: lekkiOnly })).rejects.toThrow(
      new NotFoundException('Student not found')
    );
    await expect(
      set(service, ['ada'], {
        ctx: { ...baseCtx, classScope: ['arm-9z'] },
      })
    ).rejects.toThrow(NotFoundException);
    await expect(set(service, ['nobody'])).rejects.toThrow(NotFoundException);
    expect(repository.takers).toEqual([]);
  });

  it('answers 404 for an unknown subject and a foreign school year', async () => {
    const { service } = setup();
    await expect(set(service, [], { subjectId: 'elsewhere' })).rejects.toThrow(
      new NotFoundException('Subject not found')
    );
    await expect(
      service.set(baseCtx, 'french', {
        sessionId: 'other-school-year',
        studentIds: [],
      })
    ).rejects.toThrow(new NotFoundException('School year not found'));
  });

  it('only changes the chosen school year', async () => {
    const { repository, service } = setup();
    repository.enrollments.push(enrol('ada', 'jss1', 'year-2'));
    repository.takers = [{ enrollmentId: 'e-ada-year-2', subjectId: 'french' }];
    await set(service, ['ada']);
    expect(takersOf(repository, 'french')).toEqual([
      'e-ada-year-1',
      'e-ada-year-2',
    ]);
  });
});
