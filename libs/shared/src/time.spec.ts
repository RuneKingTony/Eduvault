import { fmtLagosDateTime, lagosDateOf } from './time';

describe('fmtLagosDateTime', () => {
  it('reads the clock in Lagos, which is an hour ahead of UTC', () => {
    expect(fmtLagosDateTime('2026-10-07T09:05:00.000Z')).toBe(
      '2026-10-07 10:05'
    );
  });

  it('rolls into the next Lagos day', () => {
    expect(fmtLagosDateTime('2026-10-07T23:30:00.000Z')).toBe(
      '2026-10-08 00:30'
    );
    expect(lagosDateOf('2026-10-07T23:30:00.000Z')).toBe('2026-10-08');
  });

  it('accepts a Date and refuses a bad timestamp', () => {
    expect(fmtLagosDateTime(new Date('2026-01-01T00:00:00Z'))).toBe(
      '2026-01-01 01:00'
    );
    expect(() => fmtLagosDateTime('not a date')).toThrow(RangeError);
  });
});
