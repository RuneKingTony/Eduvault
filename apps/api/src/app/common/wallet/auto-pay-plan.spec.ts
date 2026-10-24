import { isReservedReference } from '@eduvault/shared';
import { autoPayReference, planAutoPay } from './auto-pay-plan';

const child = (
  studentId: string,
  owedMinor: number,
  oldestUnpaidOn: string | null
) => ({ studentId, owedMinor, earmarkMinor: 0, oldestUnpaidOn });

describe('autoPayReference', () => {
  it('names the spend after the credit and sits in the system namespace', () => {
    expect(autoPayReference('CSH-20261024-K3Q7ZA')).toBe(
      'AUTOPAY-CSH-20261024-K3Q7ZA'
    );
    expect(isReservedReference(autoPayReference('CSH-20261024-K3Q7ZA'))).toBe(
      true
    );
  });

  it('is the same for the same credit and different for another', () => {
    expect(autoPayReference('MNFY|20|1')).toBe(autoPayReference('MNFY|20|1'));
    expect(autoPayReference('MNFY|20|1')).not.toBe(
      autoPayReference('MNFY|20|2')
    );
  });

  it('hashes a credit reference too long for the column', () => {
    const long = `MNFY|${'x'.repeat(100)}`;
    const reference = autoPayReference(long);
    expect(reference.length).toBeLessThanOrEqual(80);
    expect(reference).toMatch(/^AUTOPAY-[\da-f]{64}$/);
    expect(reference).toBe(autoPayReference(long));
    expect(reference).not.toBe(autoPayReference(`${long}y`));
  });
});

describe('planAutoPay', () => {
  it('pays the child with the oldest unpaid charge first', () => {
    expect(
      planAutoPay(
        [
          child('new', 1_000_000, '2026-10-01'),
          child('old', 1_000_000, '2026-01-10'),
        ],
        1_500_000
      )
    ).toEqual([
      { studentId: 'old', amountMinor: 1_000_000 },
      { studentId: 'new', amountMinor: 500_000 },
    ]);
  });

  it('uses a child’s set-aside money before the free money', () => {
    expect(
      planAutoPay(
        [
          { ...child('a', 1_000_000, '2026-01-10'), earmarkMinor: 1_000_000 },
          child('b', 700_000, '2026-02-01'),
        ],
        700_000
      )
    ).toEqual([
      { studentId: 'a', amountMinor: 1_000_000 },
      { studentId: 'b', amountMinor: 700_000 },
    ]);
  });

  it('skips a child who owes nothing and plans nothing for no free money', () => {
    expect(
      planAutoPay([child('a', 0, null), child('b', -500, null)], 5000)
    ).toEqual([]);
    expect(planAutoPay([child('a', 1000, '2026-01-10')], 0)).toEqual([]);
  });
});
