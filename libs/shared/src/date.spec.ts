import { fmtDate, fmtDateRange, fmtTimestamp } from './date';

describe('fmtDate', () => {
  it('formats from the date part with no timezone shift', () => {
    expect(fmtDate('2026-10-07')).toBe('7 Oct 2026');
    expect(fmtDate('2026-01-01')).toBe('1 Jan 2026');
  });

  it('shows a dash for a missing date', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
  });

  it('refuses a malformed date', () => {
    expect(() => fmtDate('07/10/2026')).toThrow(RangeError);
    expect(() => fmtDate('2026-13-01')).toThrow(RangeError);
  });
});

describe('fmtDateRange', () => {
  it('joins two dates with an en dash', () => {
    expect(fmtDateRange('2026-10-12', '2026-10-13')).toBe(
      '12 Oct 2026 – 13 Oct 2026'
    );
  });

  it('collapses a range that starts and ends on one day', () => {
    expect(fmtDateRange('2026-10-12', '2026-10-12')).toBe('12 Oct 2026');
  });
});

describe('fmtTimestamp', () => {
  it('converts to Lagos time across the day boundary', () => {
    expect(fmtTimestamp('2026-10-07T22:59:59Z')).toBe('7 Oct 2026');
    expect(fmtTimestamp('2026-10-07T23:30:00Z')).toBe('8 Oct 2026');
  });

  it('accepts a Date and shows a dash for a missing timestamp', () => {
    expect(fmtTimestamp(new Date('2026-12-31T23:00:00Z'))).toBe('1 Jan 2027');
    expect(fmtTimestamp(null)).toBe('—');
  });

  it('refuses an invalid timestamp', () => {
    expect(() => fmtTimestamp('not a time')).toThrow(RangeError);
  });
});
