import type { JournalKind } from '@eduvault/api-contract';
import {
  familyTotals,
  movementStatus,
  splitMovement,
  statementTotals,
  unpaidCharges,
  type KindMovement,
} from './statement';

const move = (
  kind: JournalKind,
  debitMinor: number,
  creditMinor: number
): KindMovement => ({ kind, debitMinor, creditMinor });

describe('movementStatus', () => {
  it.each<[JournalKind, 'debit' | 'credit', string]>([
    ['invoice', 'debit', 'charged'],
    ['invoice', 'credit', 'reduced'],
    ['adhoc', 'debit', 'charged'],
    ['store', 'debit', 'charged'],
    ['opening', 'debit', 'charged'],
    ['opening', 'credit', 'reduced'],
    ['payment', 'credit', 'paid'],
    ['payment_void', 'debit', 'cancelled'],
    ['adjustment', 'credit', 'reduced'],
    ['adjustment', 'debit', 'refunded'],
    ['wallet_spend', 'credit', 'paid'],
    ['wallet_spend', 'debit', 'cancelled'],
  ])('labels the %s %s as %s', (kind, side, status) => {
    expect(movementStatus(kind, side)).toBe(status);
  });
});

describe('statementTotals', () => {
  it('keeps Balance = Total - Reduced - Paid over a mixed history', () => {
    const history = [
      move('opening', 4_000_000, 0),
      move('invoice', 22_000_000, 1_100_000),
      move('payment', 0, 18_000_000),
      move('payment', 0, 5_000_000),
      move('payment_void', 5_000_000, 0),
      move('adjustment', 0, 2_000_000),
      move('adjustment', 1_000_000, 0),
      move('opening', 0, 300_000),
    ];

    const totals = statementTotals(history);

    expect(totals).toEqual({
      balanceMinor:
        4_000_000 +
        22_000_000 -
        1_100_000 -
        18_000_000 -
        2_000_000 +
        1_000_000 -
        300_000,
      totalMinor: 26_000_000,
      reducedMinor: 1_100_000 + 2_000_000 + 300_000,
      paidMinor: 18_000_000 + 5_000_000 - 5_000_000 - 1_000_000,
    });
    expect(totals.balanceMinor).toBe(
      totals.totalMinor - totals.reducedMinor - totals.paidMinor
    );
  });

  it('shows a cancelled payment in neither Paid nor Total', () => {
    const totals = statementTotals([
      move('invoice', 10_000_000, 0),
      move('payment', 0, 10_000_000),
      move('payment_void', 10_000_000, 0),
    ]);

    expect(totals).toEqual({
      balanceMinor: 10_000_000,
      totalMinor: 10_000_000,
      reducedMinor: 0,
      paidMinor: 0,
    });
  });

  it('is zero for no history and negative as credit when paid in excess', () => {
    expect(statementTotals([])).toEqual({
      balanceMinor: 0,
      totalMinor: 0,
      reducedMinor: 0,
      paidMinor: 0,
    });
    const credit = statementTotals([
      move('invoice', 5_000_000, 0),
      move('payment', 0, 7_000_000),
    ]);
    expect(credit.balanceMinor).toBe(-2_000_000);
    expect(credit.paidMinor).toBe(7_000_000);
  });

  it('holds the identity for every kind and either side', () => {
    const kinds: JournalKind[] = [
      'invoice',
      'adhoc',
      'payment',
      'payment_void',
      'adjustment',
      'opening',
      'store',
      'store_receive',
      'store_cost',
      'store_count',
      'wallet_topup',
      'wallet_spend',
    ];
    for (const kind of kinds) {
      for (const [debit, credit] of [
        [700, 0],
        [0, 300],
        [900, 400],
      ] as const) {
        const totals = statementTotals([move(kind, debit, credit)]);
        expect(totals.balanceMinor).toBe(
          totals.totalMinor - totals.reducedMinor - totals.paidMinor
        );
      }
    }
  });
});

describe('splitMovement', () => {
  it('gives a charged row and a reduced row for a charge with a discount', () => {
    expect(splitMovement(move('invoice', 22_000_000, 1_100_000))).toEqual([
      { side: 'debit', status: 'charged', amountMinor: 22_000_000 },
      { side: 'credit', status: 'reduced', amountMinor: 1_100_000 },
    ]);
  });

  it('gives one row for a payment and none for an empty movement', () => {
    expect(splitMovement(move('payment', 0, 5_000_000))).toEqual([
      { side: 'credit', status: 'paid', amountMinor: 5_000_000 },
    ]);
    expect(splitMovement(move('payment', 0, 0))).toEqual([]);
  });
});

describe('unpaidCharges', () => {
  it('pays charges off oldest first from everything that lowered the balance', () => {
    const history = [
      { reference: 'CHG-1', netMinor: 10_000_000 },
      { reference: 'CHG-2', netMinor: 6_000_000 },
      { reference: 'RCT-1', netMinor: -12_000_000 },
      { reference: 'CHG-3', netMinor: 3_000_000 },
    ];

    expect(unpaidCharges(history)).toEqual([
      { reference: 'CHG-2', netMinor: 6_000_000, outstandingMinor: 4_000_000 },
      { reference: 'CHG-3', netMinor: 3_000_000, outstandingMinor: 3_000_000 },
    ]);
  });

  it('lists nothing when everything is paid or the family is in credit', () => {
    expect(
      unpaidCharges([
        { reference: 'CHG-1', netMinor: 5_000_000 },
        { reference: 'RCT-1', netMinor: -9_000_000 },
      ])
    ).toEqual([]);
    expect(unpaidCharges([])).toEqual([]);
  });

  it('lists a charge that nothing has paid in full, and keeps extra fields', () => {
    expect(
      unpaidCharges([{ reference: 'CHG-1', netMinor: 100, id: 'a' }])
    ).toEqual([
      { reference: 'CHG-1', netMinor: 100, id: 'a', outstandingMinor: 100 },
    ]);
  });
});

describe('familyTotals', () => {
  it('adds only what is owed and reports credit separately', () => {
    expect(familyTotals([6_000_000, 2_000_000, -500_000])).toEqual({
      owedMinor: 8_000_000,
      creditMinor: 500_000,
    });
  });

  it('is zero for an empty family or one fully paid up', () => {
    expect(familyTotals([])).toEqual({ owedMinor: 0, creditMinor: 0 });
    expect(familyTotals([0])).toEqual({ owedMinor: 0, creditMinor: 0 });
  });
});
