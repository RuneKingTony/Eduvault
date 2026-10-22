import {
  DUE_LEFT_AFTER_DAYS,
  INACTIVE_AFTER_DAYS,
  daysAway,
  dueLeftOn,
  inactiveFrom,
  isDueLeftByAbsence,
  isInactiveByAbsence,
} from './student-lifecycle';

const SEEN = '2026-01-01';
const after = (days: number): string =>
  new Date(Date.parse(SEEN) + days * 86_400_000).toISOString().slice(0, 10);

describe('the Inactive rule', () => {
  it('turns on at day 35, not day 34', () => {
    expect(isInactiveByAbsence(SEEN, after(INACTIVE_AFTER_DAYS - 1))).toBe(
      false
    );
    expect(isInactiveByAbsence(SEEN, after(INACTIVE_AFTER_DAYS))).toBe(true);
  });

  it('never applies to a student who was not marked away', () => {
    expect(isInactiveByAbsence(null, after(500))).toBe(false);
  });

  it('names the first Inactive day', () => {
    expect(inactiveFrom(SEEN)).toBe(after(INACTIVE_AFTER_DAYS));
  });
});

describe('the Due-to-be-Left rule', () => {
  it('turns on at day 133, not day 132', () => {
    expect(isDueLeftByAbsence(SEEN, after(DUE_LEFT_AFTER_DAYS - 1))).toBe(
      false
    );
    expect(isDueLeftByAbsence(SEEN, after(DUE_LEFT_AFTER_DAYS))).toBe(true);
  });

  it('never applies to a student who was not marked away', () => {
    expect(isDueLeftByAbsence(null, after(500))).toBe(false);
  });

  it('names the first due day', () => {
    expect(dueLeftOn(SEEN)).toBe(after(DUE_LEFT_AFTER_DAYS));
  });
});

describe('a malformed date', () => {
  it('throws instead of reading as Active', () => {
    expect(() => daysAway('not-a-date', '2026-10-11')).toThrow(RangeError);
    expect(() => isInactiveByAbsence('2026-13-45', '2026-10-11')).toThrow(
      RangeError
    );
  });
});
