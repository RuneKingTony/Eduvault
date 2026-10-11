import {
  daysBetween,
  isDueToBeLeft,
  isNewIntake,
  lifeOf,
  weeksAway,
  type LifecycleFacts,
} from './lifecycle';

const today = '2026-10-11';

const facts = (overrides: Partial<LifecycleFacts> = {}): LifecycleFacts => ({
  notSeenSince: null,
  exitKind: null,
  newInCurrentSession: false,
  today,
  ...overrides,
});

const daysAgo = (days: number): string =>
  new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);

describe('daysBetween', () => {
  it('counts calendar days across month and year ends', () => {
    expect(daysBetween('2026-10-11', '2026-10-11')).toBe(0);
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('lifeOf', () => {
  it('is active when nobody has marked the student away', () => {
    expect(lifeOf(facts())).toBe('active');
  });

  it('turns inactive at day 35, not before', () => {
    expect(lifeOf(facts({ notSeenSince: daysAgo(34) }))).toBe('active');
    expect(lifeOf(facts({ notSeenSince: daysAgo(35) }))).toBe('inactive');
  });

  it('lets an exit win over the away dates', () => {
    expect(lifeOf(facts({ notSeenSince: daysAgo(60), exitKind: 'left' }))).toBe(
      'left'
    );
    expect(lifeOf(facts({ exitKind: 'graduated' }))).toBe('graduated');
  });
});

describe('isDueToBeLeft', () => {
  it('turns on at day 133, not before', () => {
    expect(isDueToBeLeft(facts({ notSeenSince: daysAgo(132) }))).toBe(false);
    expect(isDueToBeLeft(facts({ notSeenSince: daysAgo(133) }))).toBe(true);
  });

  it('is never true for an active, left or unmarked student', () => {
    expect(isDueToBeLeft(facts())).toBe(false);
    expect(isDueToBeLeft(facts({ notSeenSince: daysAgo(10) }))).toBe(false);
    expect(
      isDueToBeLeft(facts({ notSeenSince: daysAgo(200), exitKind: 'left' }))
    ).toBe(false);
  });
});

describe('isNewIntake', () => {
  it('needs a new enrolment and an active student', () => {
    expect(isNewIntake(facts({ newInCurrentSession: true }))).toBe(true);
    expect(isNewIntake(facts())).toBe(false);
    expect(
      isNewIntake(
        facts({ newInCurrentSession: true, notSeenSince: daysAgo(40) })
      )
    ).toBe(false);
    expect(
      isNewIntake(facts({ newInCurrentSession: true, exitKind: 'left' }))
    ).toBe(false);
  });

  it('keeps a student marked away for under 35 days in the new intakes', () => {
    expect(
      isNewIntake(
        facts({ newInCurrentSession: true, notSeenSince: daysAgo(34) })
      )
    ).toBe(true);
  });
});

describe('weeksAway', () => {
  it('is null for an unmarked student and floors days over seven', () => {
    expect(weeksAway(facts())).toBeNull();
    expect(weeksAway(facts({ notSeenSince: daysAgo(6) }))).toBe(0);
    expect(weeksAway(facts({ notSeenSince: daysAgo(7) }))).toBe(1);
    expect(weeksAway(facts({ notSeenSince: daysAgo(40) }))).toBe(5);
  });
});
