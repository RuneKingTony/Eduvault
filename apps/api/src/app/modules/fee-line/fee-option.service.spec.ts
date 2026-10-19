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
  students.student = student;
  repository.optional = [{ feeTypeId: 'bus', name: 'School bus' }];
  return {
    repository,
    students,
    service: new FeeOptionService(
      repository,
      students,
      new FakeFeeLineRepository()
    ),
  };
}

describe('FeeOptionService.list', () => {
  it('lists the optional fee types with whether the student opted in', async () => {
    const { service, repository } = setup();
    repository.optedIn = ['bus'];
    expect(await service.list(ctx, 'ada')).toEqual([
      { feeTypeId: 'bus', name: 'School bus', optedIn: true },
    ]);
    repository.optedIn = [];
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
    repository.optedIn = ['bus'];
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
    repository.optedIn = ['bus'];
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
