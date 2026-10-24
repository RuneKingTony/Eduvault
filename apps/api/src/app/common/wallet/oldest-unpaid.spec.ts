import { oldestUnpaidDates } from './oldest-unpaid';

const net = (studentId: string, effectiveOn: string, netMinor: number) => ({
  studentId,
  effectiveOn,
  netMinor,
});

describe('oldestUnpaidDates', () => {
  it('is the date of the first charge a payment has not covered', () => {
    const dates = oldestUnpaidDates([
      net('ada', '2026-01-10', 1_000_000),
      net('ada', '2026-02-10', -1_000_000),
      net('ada', '2026-09-01', 800_000),
    ]);
    expect(dates.get('ada')).toBe('2026-09-01');
  });

  it('counts a partly covered charge from its own date', () => {
    const dates = oldestUnpaidDates([
      net('ada', '2026-01-10', 1_000_000),
      net('ada', '2026-02-10', -400_000),
    ]);
    expect(dates.get('ada')).toBe('2026-01-10');
  });

  it('keeps each child apart and leaves out a child who owes nothing', () => {
    const dates = oldestUnpaidDates([
      net('ada', '2026-03-01', 500_000),
      net('bayo', '2026-01-05', 500_000),
      net('bayo', '2026-01-06', -500_000),
    ]);
    expect([...dates]).toEqual([['ada', '2026-03-01']]);
  });
});
