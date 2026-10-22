import {
  describeForFamily,
  describeMovement,
  lastPageOf,
  movementLink,
  pageOfRows,
  scopeNote,
  statementRowsOf,
  unpaidOf,
  type MovementRecord,
} from './statement-assembly';

const base: MovementRecord = {
  entryId: 'entry-1',
  sequence: 1,
  effectiveOn: '2026-09-01',
  reference: 'REF-1',
  kind: 'invoice',
  memo: null,
  debitMinor: 0,
  creditMinor: 0,
  storeSale: false,
  invoice: null,
  payment: null,
};

const charge: MovementRecord = {
  ...base,
  reference: 'CHG-2026-00001',
  debitMinor: 22_000_000,
  creditMinor: 1_100_000,
  invoice: {
    id: 'invoice-1',
    termLabel: 'First term, 2026/2027',
    descriptions: 'Tuition; School bus',
  },
};

const receipt: MovementRecord = {
  ...base,
  entryId: 'entry-2',
  sequence: 2,
  effectiveOn: '2026-09-20',
  reference: 'TRF-20260920-K3Q7ZA',
  kind: 'payment',
  creditMinor: 18_000_000,
  payment: {
    id: 'payment-1',
    receiptNumber: 'RCT-2026-00088',
    payerName: 'Ngozi Okeke',
    method: 'transfer',
    voided: false,
  },
};

describe('describeMovement', () => {
  it('describes a term charge and its discount', () => {
    expect(describeMovement(charge, 'charged')).toBe(
      'Term fees, First term, 2026/2027'
    );
    expect(describeMovement(charge, 'reduced')).toBe(
      'Discount on Term fees, First term, 2026/2027'
    );
  });

  it('describes store and one-off charges by their lines', () => {
    expect(describeMovement({ ...charge, kind: 'store' }, 'charged')).toBe(
      'Store purchase: Tuition; School bus'
    );
    expect(describeMovement({ ...charge, kind: 'adhoc' }, 'charged')).toBe(
      'One-off: Tuition; School bus'
    );
  });

  it('names the receipt, the payer and the way they paid', () => {
    expect(describeMovement(receipt, 'paid')).toBe(
      'Payment RCT-2026-00088 from Ngozi Okeke (Bank transfer)'
    );
    expect(
      describeMovement(
        { ...receipt, payment: { ...receipt.payment!, method: 'pos' } },
        'paid'
      )
    ).toContain('(POS)');
  });

  it('drops the doubled word of a cancellation', () => {
    expect(
      describeMovement(
        {
          ...base,
          kind: 'payment_void',
          memo: 'Void of RCT-2026-00088: Keyed the wrong amount',
        },
        'cancelled'
      )
    ).toBe('Cancelled: RCT-2026-00088, Keyed the wrong amount');
    expect(
      describeMovement({ ...base, kind: 'payment_void' }, 'cancelled')
    ).toBe('Cancelled: REF-1');
  });

  it('writes opening balances and adjustments from their memo', () => {
    expect(
      describeMovement(
        { ...base, kind: 'opening', memo: 'Opening balance' },
        'charged'
      )
    ).toBe('Opening balance');
    expect(
      describeMovement(
        { ...base, kind: 'opening', memo: 'Carried from 2025' },
        'charged'
      )
    ).toBe('Opening balance: Carried from 2025');
    expect(
      describeMovement(
        { ...base, kind: 'adjustment', memo: 'Refund: overpaid' },
        'refunded'
      )
    ).toBe('Refund: overpaid');
  });
});

describe('describeForFamily', () => {
  it('keeps what a family can read and drops staff notes', () => {
    expect(describeForFamily(charge, 'charged')).toBe(
      describeMovement(charge, 'charged')
    );
    expect(describeForFamily(receipt, 'paid')).toBe(
      describeMovement(receipt, 'paid')
    );
    expect(
      describeForFamily(
        {
          ...base,
          kind: 'payment_void',
          memo: 'Void of RCT-2026-00088: Keyed the wrong amount',
        },
        'cancelled'
      )
    ).toBe('Payment RCT-2026-00088 cancelled');
    expect(
      describeForFamily({ ...base, kind: 'payment_void' }, 'cancelled')
    ).toBe('Payment cancelled');
    expect(
      describeForFamily(
        { ...base, kind: 'opening', memo: 'Carried from 2025' },
        'charged'
      )
    ).toBe('Opening balance');
    expect(
      describeForFamily(
        { ...base, kind: 'adjustment', memo: 'Refund: overpaid' },
        'refunded'
      )
    ).toBe('Refund');
    expect(
      describeForFamily(
        { ...base, kind: 'adjustment', memo: 'Goodwill' },
        'reduced'
      )
    ).toBe('Adjustment');
  });
});

describe('movementLink', () => {
  it('links a charge to the charge, a payment to the receipt, and the rest to nothing', () => {
    expect(movementLink(charge)).toEqual({ type: 'invoice', id: 'invoice-1' });
    expect(movementLink(receipt)).toEqual({ type: 'payment', id: 'payment-1' });
    expect(movementLink({ ...base, kind: 'opening' })).toBeNull();
  });
});

describe('statementRowsOf', () => {
  it('gives a Charged and a Reduced row for a charge with a discount, then the payment', () => {
    const rows = statementRowsOf([charge, receipt]);

    expect(rows.map((row) => [row.status, row.amountMinor])).toEqual([
      ['charged', 22_000_000],
      ['reduced', 1_100_000],
      ['paid', 18_000_000],
    ]);
    expect(rows[2]).toMatchObject({
      reference: 'TRF-20260920-K3Q7ZA',
      link: { type: 'payment', id: 'payment-1' },
    });
  });

  it('flags the row of a voided receipt so clients do not read it as plainly Paid', () => {
    const voided: MovementRecord = {
      ...receipt,
      payment: { ...receipt.payment!, voided: true },
    };

    expect(statementRowsOf([voided, receipt]).map((row) => row.voided)).toEqual(
      [true, false]
    );
  });

  it('writes one row per correction kind from its memo, in the bucket the PRD names', () => {
    const adjustment = (
      reference: string,
      memo: string,
      side: Pick<MovementRecord, 'debitMinor' | 'creditMinor'>
    ): MovementRecord => ({
      ...base,
      kind: 'adjustment',
      reference,
      memo,
      ...side,
    });

    const rows = statementRowsOf([
      adjustment('ADJ-2026-0001', 'Reduce a fee: Late enrolment', {
        debitMinor: 0,
        creditMinor: 1_000_000,
      }),
      adjustment('ADJ-2026-0002', 'Cancel a balance: Left the school', {
        debitMinor: 0,
        creditMinor: 1_200_000,
      }),
      adjustment('ADJ-2026-0003', 'Refund: Overpaid', {
        debitMinor: 500_000,
        creditMinor: 0,
      }),
      {
        ...base,
        kind: 'payment_void',
        reference: 'VOID-CASH-1',
        memo: 'Void of RCT-2026-00098: Wrong child',
        debitMinor: 2_000_000,
      },
    ]);

    expect(
      rows.map((row) => [row.description, row.status, row.amountMinor])
    ).toEqual([
      ['Reduce a fee: Late enrolment', 'reduced', 1_000_000],
      ['Cancel a balance: Left the school', 'reduced', 1_200_000],
      ['Refund: Overpaid', 'refunded', 500_000],
      ['Cancelled: RCT-2026-00098, Wrong child', 'cancelled', 2_000_000],
    ]);
  });
});

describe('unpaidOf', () => {
  it('lists what is left of the oldest charges first, with their links', () => {
    expect(unpaidOf([charge, receipt])).toEqual([
      {
        reference: 'CHG-2026-00001',
        outstandingMinor: 22_000_000 - 1_100_000 - 18_000_000,
        link: { type: 'invoice', id: 'invoice-1' },
      },
    ]);
  });

  it('calls an opening debt by its name rather than its internal reference', () => {
    const opening: MovementRecord = {
      ...base,
      kind: 'opening',
      reference: 'OPEN-1234',
      debitMinor: 4_000_000,
    };
    expect(unpaidOf([opening])).toEqual([
      { reference: 'Opening balance', outstandingMinor: 4_000_000, link: null },
    ]);
  });

  it('names a cancelled receipt rather than showing its internal void reference', () => {
    const reversal: MovementRecord = {
      ...base,
      kind: 'payment_void',
      reference: 'VOID-CASH-1',
      memo: 'Void of RCT-2026-00098: Wrong child',
      debitMinor: 2_000_000,
    };
    expect(unpaidOf([reversal])).toEqual([
      {
        reference: 'Payment RCT-2026-00098 cancelled',
        outstandingMinor: 2_000_000,
        link: null,
      },
    ]);
  });

  it('leaves a store sale and its payment out, so older debt keeps its full amount', () => {
    const sale: MovementRecord = {
      ...base,
      entryId: 'entry-3',
      reference: 'CHG-2026-00002',
      kind: 'store',
      storeSale: true,
      debitMinor: 900_000,
    };
    const salePayment: MovementRecord = {
      ...receipt,
      entryId: 'entry-4',
      storeSale: true,
      creditMinor: 900_000,
    };
    expect(
      unpaidOf([{ ...charge, creditMinor: 0 }, sale, salePayment])
    ).toEqual([
      {
        reference: 'CHG-2026-00001',
        outstandingMinor: 22_000_000,
        link: { type: 'invoice', id: 'invoice-1' },
      },
    ]);
  });

  it('lists nothing once the family has paid everything', () => {
    expect(
      unpaidOf([
        { ...charge, creditMinor: 0, debitMinor: 100 },
        { ...receipt, creditMinor: 100 },
      ])
    ).toEqual([]);
  });
});

describe('pageOfRows', () => {
  const rows = Array.from({ length: 25 }, (_, index) => index + 1);

  it('opens on the last page so the newest entries show', () => {
    expect(pageOfRows(rows, undefined, 10)).toEqual({
      items: [21, 22, 23, 24, 25],
      page: 3,
    });
  });

  it('opens a page that was asked for and never past the last', () => {
    expect(pageOfRows(rows, 1, 10).items).toHaveLength(10);
    expect(pageOfRows(rows, 2, 10).page).toBe(2);
    expect(pageOfRows(rows, 9, 10).page).toBe(3);
  });

  it('is page 1 with no rows', () => {
    expect(pageOfRows([], undefined, 10)).toEqual({ items: [], page: 1 });
    expect(lastPageOf(0, 10)).toBe(1);
    expect(lastPageOf(10, 10)).toBe(1);
    expect(lastPageOf(11, 10)).toBe(2);
  });
});

describe('scopeNote', () => {
  it('says All campuses, or names the campuses followed by campus', () => {
    expect(scopeNote('all')).toBe('All campuses');
    expect(scopeNote(['Lekki'])).toBe('Lekki campus');
    expect(scopeNote(['Lekki', 'Ikeja'])).toBe('Lekki, Ikeja campus');
    expect(scopeNote([])).toBe('No campuses');
  });
});
