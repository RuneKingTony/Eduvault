import { PROTOTYPE_TODAY, seedOffsetDays, shiftDate } from './date-shift';

const weekday = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).getUTCDay();

describe('seedOffsetDays', () => {
  it('is zero on the prototype day and until the next full week', () => {
    expect(seedOffsetDays(new Date('2026-10-07T12:00:00Z'))).toBe(0);
    expect(seedOffsetDays(new Date('2026-10-13T23:59:59Z'))).toBe(0);
  });

  it('rounds down to whole weeks', () => {
    expect(seedOffsetDays(new Date('2026-10-14T00:00:00Z'))).toBe(7);
    expect(seedOffsetDays(new Date('2026-10-20T09:00:00Z'))).toBe(7);
    expect(seedOffsetDays(new Date('2026-11-04T09:00:00Z'))).toBe(28);
  });

  it('rounds down for run days before the prototype day', () => {
    expect(seedOffsetDays(new Date('2026-10-06T00:00:00Z'))).toBe(-7);
  });

  it('lets SEED_TODAY pin the run day', () => {
    const now = new Date('2030-01-01T00:00:00Z');
    expect(seedOffsetDays(now, '2026-10-07')).toBe(0);
    expect(seedOffsetDays(now, '2026-10-21')).toBe(14);
  });
});

describe('shifting', () => {
  it('moves dates by the offset and preserves the weekday', () => {
    const offset = seedOffsetDays(new Date('2027-03-03T10:00:00Z'));
    expect(offset % 7).toBe(0);
    for (const date of ['2026-10-07', '2026-09-30', '2026-01-15']) {
      expect(weekday(shiftDate(date, offset))).toBe(weekday(date));
    }
    expect(shiftDate(PROTOTYPE_TODAY, offset)).toBe('2027-03-03');
  });

  it('is the identity at offset zero', () => {
    expect(shiftDate('2026-09-30', 0)).toBe('2026-09-30');
  });
});
