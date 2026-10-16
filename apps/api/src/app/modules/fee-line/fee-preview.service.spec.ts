import { NotFoundException } from '@nestjs/common';
import type { FeeLine } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  FakeFeeLineRepository,
  FakeFeeStudentRepository,
  FakeFeeOptionRepository,
} from './fake-fee-line.repository';
import type { StudentFeeContext } from './fee-line.repository';
import { FeePreviewService } from './fee-preview.service';

const ctx = {
  organizationId: 'school-a',
  campusScope: 'all',
  permissions: { student: ['read'], feeLine: ['read'], invoice: ['read'] },
} as OrgContext;
const query = { termId: 'term-1', studentId: 'ada' };

const line = (over: Partial<FeeLine>): FeeLine => ({
  id: 'line',
  termId: 'term-1',
  classLevelId: 'jss2',
  levelName: 'JSS 2',
  levelSequence: 8,
  feeTypeId: 'tuition',
  feeTypeCode: 4010,
  feeTypeName: 'Tuition',
  campusId: null,
  campusName: null,
  name: 'Tuition',
  amountMinor: 18_000_000,
  appliesTo: 'all',
  isOptional: false,
  retiredAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const student = (over: Partial<StudentFeeContext> = {}): StudentFeeContext => ({
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
  placement: { armName: 'JSS 2A', campusId: 'ikeja', campusName: 'Ikeja' },
  latestPlacement: null,
  ...over,
});

function setup(rows: FeeLine[], context: StudentFeeContext | undefined) {
  const lines = new FakeFeeLineRepository();
  lines.rows.push(...rows);
  lines.terms.set('term-1', {
    id: 'term-1',
    sessionId: 's1',
    endsOn: '2026-12-18',
  });
  const options = new FakeFeeOptionRepository();
  const students = new FakeFeeStudentRepository();
  students.student = context;
  return {
    options,
    students,
    service: new FeePreviewService(lines, options, students),
  };
}

describe('FeePreviewService.preview', () => {
  it('uses the campus override of the term placement and totals the lines', async () => {
    const { service } = setup(
      [
        line({ id: 'base' }),
        line({
          id: 'override',
          campusId: 'ikeja',
          campusName: 'Ikeja',
          amountMinor: 16_500_000,
        }),
        line({
          id: 'pta',
          feeTypeId: 'pta',
          feeTypeCode: 4020,
          feeTypeName: 'PTA fee',
          name: 'PTA fee',
          amountMinor: 1_000_000,
        }),
      ],
      student()
    );
    const preview = await service.preview(ctx, query);
    expect(preview.student).toMatchObject({
      armName: 'JSS 2A',
      campusName: 'Ikeja',
      levelName: 'JSS 2',
      isNew: false,
    });
    expect(preview.lines.map((row) => row.feeLineId)).toEqual([
      'override',
      'pta',
    ]);
    expect(preview.totalMinor).toBe(17_500_000);
    expect(preview.lines[0]?.campusName).toBe('Ikeja');
  });

  it('shows the charge status of the term and the approved discount line', async () => {
    const { service, students } = setup([line({ id: 'base' })], student());
    students.facts = {
      ...students.facts,
      charged: { status: 'sent', number: 'CHG-2026-00001' },
      discounts: [
        {
          id: 'sibling',
          status: 'approved',
          kind: 'percent',
          value: 5,
          feeTypeId: 'tuition',
          feeTypeName: 'Tuition',
          reason: 'Sibling discount (3 children)',
          approvedAt: '2026-09-01T00:00:00.000Z',
          from: { sessionStartsOn: '2026-09-07', sequence: 1 },
          to: null,
        },
      ],
    };
    const preview = await service.preview(ctx, query);
    expect(preview.charged).toEqual({
      status: 'sent',
      number: 'CHG-2026-00001',
    });
    expect(preview.lines.at(-1)).toEqual({
      feeLineId: null,
      description: 'Sibling discount (3 children) (5% of tuition)',
      feeTypeName: 'Discounts given',
      amountMinor: -900_000,
      optedIn: false,
      campusName: null,
    });
    expect(preview.totalMinor).toBe(17_100_000);
    expect(preview.pendingDiscounts).toEqual([]);
  });

  it('lists a waiting discount as pending and leaves it out of the lines', async () => {
    const { service, students } = setup([line({ id: 'base' })], student());
    students.facts = {
      ...students.facts,
      discounts: [
        {
          id: 'scholarship',
          status: 'submitted',
          kind: 'percent',
          value: 50,
          feeTypeId: null,
          feeTypeName: null,
          reason: 'Academic scholarship, top of JSS 1',
          approvedAt: null,
          from: { sessionStartsOn: '2026-09-07', sequence: 1 },
          to: null,
        },
      ],
    };
    const preview = await service.preview(ctx, query);
    expect(preview.pendingDiscounts).toEqual([
      'Academic scholarship, top of JSS 1',
    ]);
    expect(preview.totalMinor).toBe(18_000_000);
    expect(preview.charged).toBeNull();
  });

  it('lets the every-campus line through when the override is for new students and this one is returning', async () => {
    const { service } = setup(
      [
        line({ id: 'base' }),
        line({ id: 'override', campusId: 'ikeja', appliesTo: 'new' }),
      ],
      student()
    );
    const preview = await service.preview(ctx, query);
    expect(preview.lines.map((row) => row.feeLineId)).toEqual(['base']);
  });

  it('falls back to the home campus with no placement and shows opted-in optional lines', async () => {
    const { service, options } = setup(
      [
        line({
          id: 'bus',
          feeTypeId: 'bus',
          feeTypeName: 'School bus',
          isOptional: true,
        }),
      ],
      student({ placement: null })
    );
    expect((await service.preview(ctx, query)).lines).toEqual([]);
    options.optedIn = ['bus'];
    const preview = await service.preview(ctx, query);
    expect(preview.student.campusName).toBe('Lekki');
    expect(preview.student.armName).toBeNull();
    expect(preview.lines[0]).toMatchObject({ feeLineId: 'bus', optedIn: true });
  });

  it('prices a student with no placement in the term from the latest placement of the year', async () => {
    const { service } = setup(
      [
        line({ id: 'base' }),
        line({
          id: 'override',
          campusId: 'ikeja',
          campusName: 'Ikeja',
          amountMinor: 16_500_000,
        }),
      ],
      student({
        placement: null,
        latestPlacement: { campusId: 'ikeja', campusName: 'Ikeja' },
      })
    );
    const preview = await service.preview(ctx, query);
    expect(preview.student.campusName).toBe('Ikeja');
    expect(preview.lines.map((row) => row.feeLineId)).toEqual(['override']);
  });

  it('prices from every campus’s fee lines, as prepare does, for a student the caller can see', async () => {
    const { service } = setup(
      [line({ id: 'override', campusId: 'ikeja', campusName: 'Ikeja' })],
      student()
    );
    const preview = await service.preview(
      { ...ctx, campusScope: ['lekki'] },
      query
    );
    expect(preview.lines.map((row) => row.feeLineId)).toEqual(['override']);
  });

  it('leaves the charge and the discounts out without invoice:read', async () => {
    const { service, students } = setup([line({ id: 'base' })], student());
    students.facts = {
      ...students.facts,
      charged: { status: 'sent', number: 'CHG-2026-00001' },
      discounts: [
        {
          id: 'scholarship',
          status: 'submitted',
          kind: 'percent',
          value: 50,
          feeTypeId: null,
          feeTypeName: null,
          reason: 'Academic scholarship, top of JSS 1',
          approvedAt: null,
          from: { sessionStartsOn: '2026-09-07', sequence: 1 },
          to: null,
        },
        {
          id: 'sibling',
          status: 'approved',
          kind: 'percent',
          value: 5,
          feeTypeId: null,
          feeTypeName: null,
          reason: 'Sibling discount (3 children)',
          approvedAt: '2026-09-01T00:00:00.000Z',
          from: { sessionStartsOn: '2026-09-07', sequence: 1 },
          to: null,
        },
      ],
    };
    const preview = await service.preview(
      { ...ctx, permissions: { student: ['read'], feeLine: ['read'] } },
      query
    );
    expect(preview).not.toHaveProperty('charged');
    expect(preview.pendingDiscounts).toEqual([]);
    expect(preview.lines.map((row) => row.feeLineId)).toEqual(['base']);
    expect(preview.totalMinor).toBe(18_000_000);
  });

  it('reports no charge and no pending discounts when there are none', async () => {
    const { service } = setup([line({ id: 'base' })], student());
    const preview = await service.preview(ctx, query);
    expect(preview.charged).toBeNull();
    expect(preview.pendingDiscounts).toEqual([]);
  });

  it('answers 404 for a student outside the scope, with no enrolment or in an unknown term', async () => {
    await expect(
      setup([], undefined).service.preview(ctx, query)
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup([], student({ enrollment: null })).service.preview(ctx, query)
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup([], student()).service.preview(ctx, {
        ...query,
        termId: 'elsewhere',
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FeePreviewService.candidates', () => {
  it('lists the candidates of the term’s school year', async () => {
    const { service, students } = setup([], student());
    students.candidateList = {
      items: [
        {
          id: 'ada',
          name: 'Ada Okeke',
          admissionNumber: 'GF-0123',
          levelName: 'JSS 2',
        },
      ],
      total: 1,
    };
    expect(await service.candidates(ctx, { termId: 'term-1' })).toEqual(
      students.candidateList
    );
  });

  it('answers 404 for an unknown term', async () => {
    await expect(
      setup([], student()).service.candidates(ctx, { termId: 'elsewhere' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
