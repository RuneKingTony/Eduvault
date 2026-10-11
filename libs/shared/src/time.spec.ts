import {
  fmtLagosDateTime,
  greetingFor,
  lagosDateOf,
  lagosHourOf,
} from './time';

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

describe('lagosHourOf', () => {
  it('reads the hour in Lagos, not UTC', () => {
    const instant = '2026-10-07T11:30:00.000Z';
    expect(lagosHourOf(instant)).toBe(12);
    expect(greetingFor(lagosHourOf(instant))).toBe('Good afternoon');
  });

  it('rolls past midnight and accepts a Date', () => {
    expect(lagosHourOf('2026-10-07T23:30:00.000Z')).toBe(0);
    expect(lagosHourOf(new Date('2026-10-07T08:00:00Z'))).toBe(9);
  });

  it('refuses a bad timestamp', () => {
    expect(() => lagosHourOf('not a date')).toThrow(RangeError);
  });
});

describe('greetingFor', () => {
  it('switches at 12:00 and 17:00', () => {
    expect(greetingFor(0)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(16)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Good evening');
  });
});
