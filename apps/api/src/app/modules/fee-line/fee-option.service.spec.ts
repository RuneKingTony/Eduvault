import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FEE_OPTION_NOT_OPTIONAL_MESSAGE } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  FakeFeeLineRepository,
  FakeFeeOptionRepository,
  FakeFeeStudentRepository,
} from './fake-fee-line.repository';
import type { StudentFeeContext } from './fee-line.repository';
import { FeeOptionService } from './fee-option.service';

const ctx = {
  organizationId: 'school-a',
  user: { id: 'caller', name: 'Tunde Bakare' },
  campusScope: 'all',
} as OrgContext;

const student: StudentFeeContext = {
  studentId: 'ada',
  name: 'Ada Okeke',
  homeCampusId: 'lekki',
  homeCampusName: 'Lekki',
  enrollment: {
    id: 'enrol-1',
    classLevelId: 'jss2',
    levelName: 'JSS 2',
    isNew: false,
  },
  placement: null,
  latestPlacement: null,
};

function setup() {
  const repository = new FakeFeeOptionRepository();
  const students = new FakeFeeStudentRepository();
  const lines = new FakeFeeLineRepository();
  students.student = student;
  repository.optional = [{ feeTypeId: 'bus', name: 'School bus' }];
  lines.feeTypes.set('bus', { id: 'bus', code: 4020, name: 'School bus' });
  lines.terms.set('term-1', {
    id: 'term-1',
    name: 'First term',
    schoolYearName: '2026/2027',
    sessionId: 'session-1',
    startsOn: '2026-09-07',
    endsOn: '2026-12-18',
  });
  return {
    repository,
    students,
    lines,
    service: new FeeOptionService(repository, students, lines),
  };
}

const bea: StudentFeeContext = {
  ...student,
  studentId: 'bea',
  name: 'Bea Eze',
  enrollment: {
    id: 'enrol-2',
    classLevelId: 'jss3',
    levelName: 'JSS 3',
    isNew: false,
  },
};

function setupMany() {
  const parts = setup();
  parts.students.byId.set('ada', student);
  parts.students.byId.set('bea', bea);
  parts.repository.optionalByLevel.set('jss3', [
    { feeTypeId: 'bus', name: 'School bus' },
  ]);
  parts.repository.identities.set('bea', {
    id: 'bea',
    name: 'Bea Eze',
    campusId: 'lekki',
  });
  return parts;
}

const bulk = { termId: 'term-1', studentIds: ['ada', 'bea'], optedIn: true };

describe('FeeOptionService.list', () => {
  it('lists the optional fee types with whether the student opted in', async () => {
    const { service, repository } = setup();
    repository.optIn('enrol-1', 'bus');
    expect(await service.list(ctx, 'ada')).toEqual([
      { feeTypeId: 'bus', name: 'School bus', optedIn: true },
    ]);
    repository.held.clear();
    expect(await service.list(ctx, 'ada')).toEqual([
      { feeTypeId: 'bus', name: 'School bus', optedIn: false },
    ]);
  });

  it('answers 404 for a student outside the finance scope', async () => {
    const { service, students } = setup();
    students.student = undefined;
    await expect(service.list(ctx, 'ada')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 404 for a school year that is not in the school', async () => {
    const { service } = setup();
    await expect(service.list(ctx, 'ada', 'elsewhere')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('is empty without an enrolment or a current school year', async () => {
    const { service, repository, students } = setup();
    students.student = { ...student, enrollment: null };
    expect(await service.list(ctx, 'ada')).toEqual([]);
    students.student = student;
    repository.session = undefined;
    expect(await service.list(ctx, 'ada')).toEqual([]);
  });
});

describe('FeeOptionService.set', () => {
  it('records the opt-in against the enrolment', async () => {
    const { service, repository } = setup();
    const result = await service.set(
      ctx,
      { studentId: 'ada', feeTypeId: 'bus' },
      { optedIn: true }
    );
    expect(result).toEqual({ feeTypeId: 'bus', optedIn: true });
    expect(repository.changes).toEqual([
      {
        organizationId: 'school-a',
        userId: 'caller',
        studentId: 'ada',
        enrollmentId: 'enrol-1',
        feeTypeId: 'bus',
        optedIn: true,
      },
    ]);
  });

  it('switches an opt-in off after the level has no live optional line', async () => {
    const { service, repository } = setup();
    repository.optional = [];
    repository.optIn('enrol-1', 'bus');
    const result = await service.set(
      ctx,
      { studentId: 'ada', feeTypeId: 'bus' },
      { optedIn: false }
    );
    expect(result).toEqual({ feeTypeId: 'bus', optedIn: false });
    expect(repository.changes).toHaveLength(1);
  });

  it('records one opt-in row on the student’s campus', async () => {
    const { service, repository } = setup();
    await service.set(
      ctx,
      { studentId: 'ada', feeTypeId: 'bus' },
      { optedIn: true }
    );
    expect(repository.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'fee_option.opted_in',
        actorUserId: 'caller',
        subjectType: 'student',
        subjectId: 'ada',
        text: 'Tunde Bakare opted Ada Okeke into School bus.',
        data: {
          studentId: 'ada',
          feeTypeId: 'bus',
          enrollmentId: 'enrol-1',
          optedIn: true,
        },
      },
    ]);
  });

  it('records one opt-out row for a fee the student had opted into', async () => {
    const { service, repository } = setup();
    repository.optIn('enrol-1', 'bus');
    await service.set(
      ctx,
      { studentId: 'ada', feeTypeId: 'bus' },
      { optedIn: false }
    );
    expect(repository.recorded).toHaveLength(1);
    expect(repository.recorded[0]).toMatchObject({
      kind: 'fee_option.opted_out',
      text: 'Tunde Bakare opted Ada Okeke out of School bus.',
      data: { optedIn: false },
    });
  });

  it('records nothing when the state does not change', async () => {
    const { service, repository } = setup();
    const optIn = { optedIn: true };
    const params = { studentId: 'ada', feeTypeId: 'bus' };
    await service.set(ctx, params, optIn);
    await service.set(ctx, params, optIn);
    expect(repository.recorded).toHaveLength(1);
    const { service: other, repository: untouched } = setup();
    await other.set(ctx, params, { optedIn: false });
    expect(untouched.recorded).toEqual([]);
  });

  it('answers 400 for a fee type with no optional line for the level', async () => {
    const { service, repository } = setup();
    const refused = service.set(
      ctx,
      { studentId: 'ada', feeTypeId: 'tuition' },
      { optedIn: true }
    );
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(FEE_OPTION_NOT_OPTIONAL_MESSAGE);
    expect(repository.changes).toEqual([]);
    expect(repository.recorded).toEqual([]);
  });

  it('answers 404 for a school year that is not in the school', async () => {
    const { service, repository } = setup();
    await expect(
      service.set(
        ctx,
        { studentId: 'ada', feeTypeId: 'bus' },
        { optedIn: true, sessionId: 'elsewhere' }
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.changes).toEqual([]);
  });

  it('answers 400 for a student with no enrolment in the school year', async () => {
    const { service, students } = setup();
    students.student = { ...student, enrollment: null };
    await expect(
      service.set(
        ctx,
        { studentId: 'ada', feeTypeId: 'bus' },
        { optedIn: true }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 404 for a student outside the finance scope', async () => {
    const { service, students, repository } = setup();
    students.student = undefined;
    await expect(
      service.set(
        ctx,
        { studentId: 'ada', feeTypeId: 'bus' },
        { optedIn: true }
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.recorded).toEqual([]);
  });
});

describe('FeeOptionService.setMany', () => {
  it('opts several students in with one activity row each', async () => {
    const { service, repository } = setupMany();
    const result = await service.setMany(ctx, 'bus', bulk);
    expect(result).toEqual({
      feeTypeId: 'bus',
      optedIn: true,
      changed: 2,
      unchanged: 0,
    });
    expect(repository.held.get('enrol-1')).toEqual(['bus']);
    expect(repository.held.get('enrol-2')).toEqual(['bus']);
    expect(repository.recorded.map((row) => row.subjectId)).toEqual([
      'ada',
      'bea',
    ]);
    expect(repository.recorded.map((row) => row.kind)).toEqual([
      'fee_option.opted_in',
      'fee_option.opted_in',
    ]);
  });

  it('answers changed 0 and writes no activity on a replay', async () => {
    const { service, repository } = setupMany();
    await service.setMany(ctx, 'bus', bulk);
    const before = repository.recorded.length;
    const replay = await service.setMany(ctx, 'bus', bulk);
    expect(replay).toMatchObject({ changed: 0, unchanged: 2 });
    expect(repository.recorded).toHaveLength(before);
  });

  it('counts only the students whose state changed', async () => {
    const { service, repository } = setupMany();
    repository.optIn('enrol-1', 'bus');
    const result = await service.setMany(ctx, 'bus', bulk);
    expect(result).toMatchObject({ changed: 1, unchanged: 1 });
    expect(repository.recorded).toHaveLength(1);
  });

  it('counts a repeated student id once', async () => {
    const { service, repository } = setupMany();
    const result = await service.setMany(ctx, 'bus', {
      ...bulk,
      studentIds: ['ada', 'bea', 'ada'],
    });
    expect(result).toMatchObject({ changed: 2, unchanged: 0 });
    expect(repository.recorded).toHaveLength(2);
  });

  it('answers 404 and saves nothing when one student is out of scope', async () => {
    const { service, students, repository } = setupMany();
    students.byId.set('bea', undefined);
    await expect(service.setMany(ctx, 'bus', bulk)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(repository.changes).toEqual([]);
    expect(repository.recorded).toEqual([]);
  });

  it('answers 400 and saves nothing when one student cannot take the fee type', async () => {
    const { service, repository } = setupMany();
    repository.optionalByLevel.set('jss3', []);
    await expect(service.setMany(ctx, 'bus', bulk)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(repository.changes).toEqual([]);
    expect(repository.recorded).toEqual([]);
  });

  it('answers 400 and saves nothing when one student has no enrolment', async () => {
    const { service, students, repository } = setupMany();
    students.byId.set('bea', { ...bea, enrollment: null });
    await expect(service.setMany(ctx, 'bus', bulk)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(repository.changes).toEqual([]);
  });

  it('answers 404 for an unknown fee type or term', async () => {
    const { service, repository } = setupMany();
    await expect(service.setMany(ctx, 'ghost', bulk)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(
      service.setMany(ctx, 'bus', { ...bulk, termId: 'ghost' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.changes).toEqual([]);
  });

  it('opts out without a live optional line', async () => {
    const { service, repository } = setupMany();
    repository.optional = [];
    repository.optionalByLevel.clear();
    repository.optIn('enrol-1', 'bus');
    repository.optIn('enrol-2', 'bus');
    const result = await service.setMany(ctx, 'bus', {
      ...bulk,
      optedIn: false,
    });
    expect(result).toMatchObject({ optedIn: false, changed: 2, unchanged: 0 });
    expect(repository.held.get('enrol-1')).toEqual([]);
    expect(repository.recorded.map((row) => row.kind)).toEqual([
      'fee_option.opted_out',
      'fee_option.opted_out',
    ]);
  });
});

describe('FeeOptionService.roster', () => {
  it('maps the term to its school year and passes the caller’s scope', async () => {
    const { service, repository } = setup();
    const row = {
      studentId: 'ada',
      name: 'Ada Okeke',
      admissionNumber: 'ADM-1',
      levelName: 'JSS 2',
      campusName: 'Lekki',
      optedIn: true,
    };
    repository.roster = { items: [row], total: 1 };
    const scoped = { ...ctx, campusScope: ['lekki'] } as OrgContext;
    const roster = await service.roster(scoped, 'bus', {
      termId: 'term-1',
      q: 'ada',
    });
    expect(roster).toEqual({
      schoolYearName: '2026/2027',
      items: [row],
      total: 1,
    });
    expect(repository.rosterQueries).toEqual([
      {
        scope: { organizationId: 'school-a', campusScope: ['lekki'] },
        query: { sessionId: 'session-1', feeTypeId: 'bus', q: 'ada' },
      },
    ]);
  });

  it('answers 404 for an unknown fee type or term', async () => {
    const { service } = setup();
    await expect(
      service.roster(ctx, 'ghost', { termId: 'term-1' })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.roster(ctx, 'bus', { termId: 'ghost' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
