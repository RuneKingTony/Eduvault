import { typicalTotal } from './typical-total';
import type { FeeLineFacts } from './applicable-lines';

const line = (
  amountMinor: number,
  over: Partial<FeeLineFacts> = {}
): FeeLineFacts & { amountMinor: number } => ({
  amountMinor,
  feeTypeId: 'tuition',
  termId: 'term-1',
  classLevelId: 'jss2',
  campusId: null,
  appliesTo: 'all',
  isOptional: false,
  retiredAt: null,
  ...over,
});

const where = { termId: 'term-1', classLevelId: 'jss2' };

describe('typicalTotal', () => {
  it('adds every non-optional every-campus line that is not new-only', () => {
    const lines = [
      line(18_000_000),
      line(1_000_000, { feeTypeId: 'pta' }),
      line(4_500_000, { feeTypeId: 'bus', isOptional: true }),
      line(2_500_000, { feeTypeId: 'levy', appliesTo: 'new' }),
      line(800_000, { feeTypeId: 'trip', isOptional: true }),
    ];
    expect(typicalTotal(lines, where)).toBe(19_000_000);
  });

  it('counts a returning-only line', () => {
    expect(
      typicalTotal([line(300_000, { appliesTo: 'returning' })], where)
    ).toBe(300_000);
  });

  it('ignores campus overrides, retired lines and other terms or levels', () => {
    const lines = [
      line(100, { campusId: 'ikeja' }),
      line(200, { retiredAt: '2026-10-01T00:00:00.000Z' }),
      line(400, { termId: 'term-2' }),
      line(800, { classLevelId: 'jss1' }),
      line(1600),
    ];
    expect(typicalTotal(lines, where)).toBe(1600);
  });

  it('is zero with no lines', () => {
    expect(typicalTotal([], where)).toBe(0);
  });
});
