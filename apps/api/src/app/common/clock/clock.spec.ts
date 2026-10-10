import { Clock, schoolToday } from './clock';

describe('Clock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the Lagos date, which is already tomorrow after 23:00 UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T23:30:00Z'));
    expect(new Clock().today()).toBe('2026-10-08');
    vi.setSystemTime(new Date('2026-10-07T22:30:00Z'));
    expect(new Clock().today()).toBe('2026-10-07');
  });

  it('returns a pinned date until it is reset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T09:00:00Z'));
    const clock = new Clock();
    clock.set('2027-01-04');
    expect(clock.today()).toBe('2027-01-04');
    clock.set(null);
    expect(clock.today()).toBe('2026-10-07');
  });

  it('refuses to be pinned in production', () => {
    expect(() =>
      new Clock({ NODE_ENV: 'production' }).set('2027-01-04')
    ).toThrow('The clock cannot be pinned in production');
  });

  it('gives a school the same date', () => {
    const clock = new Clock();
    clock.set('2026-12-11');
    expect(schoolToday({ organizationId: 'org' }, clock)).toBe('2026-12-11');
  });
});
