import type { FeeLine, FeeType } from '@eduvault/api-contract';
import { buildFeeGrid } from './fee-grid';

const tuition: FeeType = { id: 'tuition', code: 4010, name: 'Tuition' };
const pta: FeeType = { id: 'pta', code: 4020, name: 'PTA fee' };

const line = (id: string, over: Partial<FeeLine> = {}): FeeLine => ({
  id,
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

describe('buildFeeGrid', () => {
  it('shows the base amount and the campus overrides of a cell', () => {
    const rows = buildFeeGrid({
      live: [
        line('base'),
        line('ikeja', {
          campusId: 'c-ikeja',
          campusName: 'Ikeja',
          amountMinor: 16_500_000,
        }),
      ],
      shown: [tuition],
      withTypicalTotal: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells[0]?.base?.amountMinor).toBe(18_000_000);
    expect(rows[0]?.cells[0]?.overrides).toEqual([
      expect.objectContaining({ campusName: 'Ikeja', amountMinor: 16_500_000 }),
    ]);
  });

  it('leaves the base empty for an override-only cell', () => {
    const rows = buildFeeGrid({
      live: [line('ikeja', { campusId: 'c-ikeja', campusName: 'Ikeja' })],
      shown: [tuition],
      withTypicalTotal: false,
    });
    expect(rows[0]?.cells[0]?.base).toBeNull();
    expect(rows[0]?.cells[0]?.overrides).toHaveLength(1);
  });

  it('has one row per level that holds a shown fee type, in level order', () => {
    const rows = buildFeeGrid({
      live: [
        line('a', {
          classLevelId: 'jss3',
          levelName: 'JSS 3',
          levelSequence: 9,
        }),
        line('b'),
        line('c', {
          feeTypeId: 'pta',
          feeTypeCode: 4020,
          classLevelId: 'p1',
          levelSequence: 1,
          levelName: 'Primary 1',
        }),
      ],
      shown: [tuition],
      withTypicalTotal: false,
    });
    expect(rows.map((row) => row.level.name)).toEqual(['JSS 2', 'JSS 3']);
  });

  it('gives a cell for each shown fee type, empty when the level has none', () => {
    const rows = buildFeeGrid({
      live: [line('p', { feeTypeId: 'pta', feeTypeCode: 4020 })],
      shown: [tuition, pta],
      withTypicalTotal: false,
    });
    expect(rows[0]?.cells.map((cell) => cell.base?.feeLineId ?? null)).toEqual([
      null,
      'p',
    ]);
  });

  it('adds the typical total across every fee type, not only the shown ones', () => {
    const rows = buildFeeGrid({
      live: [
        line('t'),
        line('p', {
          feeTypeId: 'pta',
          feeTypeCode: 4020,
          amountMinor: 1_000_000,
        }),
        line('bus', {
          feeTypeId: 'bus',
          feeTypeCode: 4030,
          amountMinor: 4_500_000,
          isOptional: true,
        }),
      ],
      shown: [tuition],
      withTypicalTotal: true,
    });
    expect(rows[0]?.typicalTotalMinor).toBe(19_000_000);
  });

  it('leaves the typical total null when not asked for', () => {
    const rows = buildFeeGrid({
      live: [line('t')],
      shown: [tuition],
      withTypicalTotal: false,
    });
    expect(rows[0]?.typicalTotalMinor).toBeNull();
  });

  it('has no rows with no lines', () => {
    expect(
      buildFeeGrid({ live: [], shown: [tuition], withTypicalTotal: true })
    ).toEqual([]);
  });
});
