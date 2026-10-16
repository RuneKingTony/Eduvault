import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FEE_OPTION_NOT_OPTIONAL_MESSAGE } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  FakeFeeOptionRepository,
  FakeFeeStudentRepository,
} from './fake-fee-line.repository';
import type { StudentFeeContext } from './fee-line.repository';
import { FeeOptionService } from './fee-option.service';

const ctx = {
  organizationId: 'school-a',
  user: { id: 'caller' },
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
};

function setup() {
  const repository = new FakeFeeOptionRepository();
  const students = new FakeFeeStudentRepository();
  students.student = student;
  repository.optional = [{ feeTypeId: 'bus', name: 'School bus' }];
  return {
    repository,
    students,
    service: new FeeOptionService(repository, students),
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
        enrollmentId: 'enrol-1',
        feeTypeId: 'bus',
        optedIn: true,
      },
    ]);
  });

  it('switches an opt-in off after the level has no live optional line', async () => {
    const { service, repository } = setup();
    repository.optional = [];
    const result = await service.set(
      ctx,
      { studentId: 'ada', feeTypeId: 'bus' },
      { optedIn: false }
    );
    expect(result).toEqual({ feeTypeId: 'bus', optedIn: false });
    expect(repository.changes).toHaveLength(1);
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
    const { service, students } = setup();
    students.student = undefined;
    await expect(
      service.set(
        ctx,
        { studentId: 'ada', feeTypeId: 'bus' },
        { optedIn: true }
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
