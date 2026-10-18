import { NotFoundException } from '@nestjs/common';
import type { FeeLine } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  FakeFeeLineRepository,
  FakeFeeTypeRepository,
} from './fake-fee-line.repository';
import { FeeGridService } from './fee-grid.service';

const ctx = { organizationId: 'school-a', campusScope: 'all' } as OrgContext;

const line = (over: Partial<FeeLine> = {}): FeeLine => ({
  id: 'line-1',
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

function setup(...rows: FeeLine[]) {
  const lines = new FakeFeeLineRepository();
  lines.rows.push(...rows);
  lines.terms.set('term-1', {
    id: 'term-1',
    name: 'First term',
    schoolYearName: '2026/2027',
    sessionId: 'session-1',
    startsOn: '2026-09-07',
    endsOn: '2026-12-18',
  });
  const feeTypes = new FakeFeeTypeRepository();
  feeTypes.types = [
    { id: 'tuition', code: 4010, name: 'Tuition' },
    { id: 'pta', code: 4020, name: 'PTA fee' },
    { id: 'bus', code: 4030, name: 'School bus' },
  ];
  return new FeeGridService(lines, feeTypes);
}

describe('FeeGridService.grid', () => {
  it('builds the school grid with tuition only and the typical total', async () => {
    const service = setup(
      line(),
      line({
        id: 'line-2',
        feeTypeId: 'pta',
        feeTypeCode: 4020,
        amountMinor: 1_000_000,
      })
    );
    const grid = await service.grid(ctx, { termId: 'term-1', group: 'school' });
    expect(grid.currency).toBe('NGN');
    expect(grid.feeTypes.map((feeType) => feeType.name)).toEqual(['Tuition']);
    expect(grid.rows[0]?.typicalTotalMinor).toBe(19_000_000);
  });

  it('shows every other fee type as a column on All other fees, with no typical total', async () => {
    const service = setup(
      line(),
      line({ id: 'line-2', feeTypeId: 'pta', feeTypeCode: 4020 })
    );
    const grid = await service.grid(ctx, { termId: 'term-1', group: 'other' });
    expect(grid.feeTypes.map((feeType) => feeType.name)).toEqual([
      'PTA fee',
      'School bus',
    ]);
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]?.typicalTotalMinor).toBeNull();
  });

  it('narrows the other grid to the chosen fee type', async () => {
    const service = setup(
      line({ id: 'line-2', feeTypeId: 'pta', feeTypeCode: 4020 })
    );
    const grid = await service.grid(ctx, {
      termId: 'term-1',
      group: 'other',
      feeTypeId: 'bus',
    });
    expect(grid.feeTypes.map((feeType) => feeType.name)).toEqual([
      'School bus',
    ]);
    expect(grid.rows).toEqual([]);
  });

  it('answers 404 for a term outside the school', async () => {
    await expect(
      setup().grid(ctx, { termId: 'elsewhere', group: 'school' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
