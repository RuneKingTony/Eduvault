import type { FeeLine } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  adjustmentApprovedActivity,
  adjustmentDeclinedActivity,
  discountApprovedActivity,
  discountDeclinedActivity,
  discountEndedActivity,
  feeLineAmountChangedActivity,
  feeLineCreatedActivity,
  feeLineRetiredActivity,
  feeLinesCopiedActivity,
  feeOptionChangedActivity,
  feeTypeCreatedActivity,
  oneOffChargeActivity,
  paymentCancellationDeclinedActivity,
  paymentCancelledActivity,
  paymentRecordedActivity,
  roundCancelledActivity,
  roundSentActivity,
  storeSaleRecordedActivity,
  storeWriteOffApprovedActivity,
  storeWriteOffDeclinedActivity,
  type AdjustmentFacts,
  type DiscountFacts,
  type FinanceActor,
  type OneOffChargeFacts,
  type PaymentFacts,
  type StoreSaleFacts,
  type StoreWriteOffFacts,
} from './finance-activity';

const LEKKI = 'campus-lekki';
const IKEJA = 'campus-ikeja';

const actor: FinanceActor = {
  organizationId: 'org-1',
  userId: 'user-1',
  name: 'Tunde Bakare',
  currency: 'NGN',
};

const payment: PaymentFacts = {
  id: 'payment-1',
  receiptNumber: 'RCT-2026-0012',
  payerName: 'Mrs Danjuma',
};

const adjustment: AdjustmentFacts = {
  id: 'adj-1',
  number: 'ADJ-2026-0003',
  kind: 'credit_note',
  amountMinor: 1_200_000,
  studentId: 'student-1',
  studentName: 'Bola Ade',
  campusId: LEKKI,
};

const discount: DiscountFacts = {
  id: 'disc-1',
  kind: 'percent',
  value: 10,
  studentId: 'student-2',
  studentName: 'Chika Obi',
  campusId: IKEJA,
};

describe('roundSentActivity', () => {
  it('writes one finance row for a single-campus round', () => {
    expect(
      roundSentActivity(actor, { id: 'run-1', number: 'BR-2026-0003' }, [
        { campusId: LEKKI, amountMinor: 10_000_000 },
        { campusId: LEKKI, amountMinor: 14_000_000 },
      ])
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'round.sent',
        actorUserId: 'user-1',
        subjectType: 'billing_run',
        subjectId: 'run-1',
        text: 'Tunde Bakare sent round BR-2026-0003: 2 charges, ₦240,000.',
        data: {
          runId: 'run-1',
          number: 'BR-2026-0003',
          charges: 2,
          totalMinor: 24_000_000,
        },
      },
    ]);
  });

  it('writes one row per campus with that campus’s count and total', () => {
    const rows = roundSentActivity(actor, { id: 'run-1', number: 'BR-1' }, [
      { campusId: LEKKI, amountMinor: 100 },
      { campusId: IKEJA, amountMinor: 500 },
      { campusId: LEKKI, amountMinor: 200 },
    ]);
    expect(rows.map((row) => [row.campusId, row.text])).toEqual([
      [LEKKI, 'Tunde Bakare sent round BR-1: 2 charges, ₦3.'],
      [IKEJA, 'Tunde Bakare sent round BR-1: 1 charge, ₦5.'],
    ]);
    expect(rows.map((row) => row.data)).toEqual([
      { runId: 'run-1', number: 'BR-1', charges: 2, totalMinor: 300 },
      { runId: 'run-1', number: 'BR-1', charges: 1, totalMinor: 500 },
    ]);
  });

  it('writes nothing for a round with no charges', () => {
    expect(
      roundSentActivity(actor, { id: 'run-1', number: 'BR-1' }, [])
    ).toEqual([]);
  });
});

describe('roundCancelledActivity', () => {
  it('writes one finance row for a single-campus round', () => {
    expect(
      roundCancelledActivity(actor, { id: 'run-1', number: 'BR-2026-0003' }, [
        { campusId: LEKKI, amountMinor: 10_000_000 },
        { campusId: LEKKI, amountMinor: 14_000_000 },
      ])
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'round.cancelled',
        actorUserId: 'user-1',
        subjectType: 'billing_run',
        subjectId: 'run-1',
        text: 'Tunde Bakare cancelled round BR-2026-0003 before it was sent: 2 prepared charges, ₦240,000.',
        data: {
          runId: 'run-1',
          number: 'BR-2026-0003',
          charges: 2,
          totalMinor: 24_000_000,
        },
      },
    ]);
  });

  it('writes one row per campus with only that campus’s count and total', () => {
    const rows = roundCancelledActivity(
      actor,
      { id: 'run-1', number: 'BR-1' },
      [
        { campusId: LEKKI, amountMinor: 100 },
        { campusId: IKEJA, amountMinor: 500 },
        { campusId: LEKKI, amountMinor: 200 },
      ]
    );
    expect(rows.map((row) => [row.campusId, row.text])).toEqual([
      [
        LEKKI,
        'Tunde Bakare cancelled round BR-1 before it was sent: 2 prepared charges, ₦3.',
      ],
      [
        IKEJA,
        'Tunde Bakare cancelled round BR-1 before it was sent: 1 prepared charge, ₦5.',
      ],
    ]);
    expect(rows.map((row) => row.data)).toEqual([
      { runId: 'run-1', number: 'BR-1', charges: 2, totalMinor: 300 },
      { runId: 'run-1', number: 'BR-1', charges: 1, totalMinor: 500 },
    ]);
  });

  it('writes nothing for a round with no charges', () => {
    expect(
      roundCancelledActivity(actor, { id: 'run-1', number: 'BR-1' }, [])
    ).toEqual([]);
  });
});

describe('paymentRecordedActivity', () => {
  it('names the receipt, amount, payer and actor', () => {
    expect(
      paymentRecordedActivity(actor, payment, [
        { campusId: LEKKI, amountMinor: 2_000_000 },
      ])
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'payment.recorded',
        actorUserId: 'user-1',
        subjectType: 'payment',
        subjectId: 'payment-1',
        text: 'Payment RCT-2026-0012 of ₦20,000 from Mrs Danjuma recorded by Tunde Bakare.',
        data: {
          paymentId: 'payment-1',
          receiptNumber: 'RCT-2026-0012',
          amountMinor: 2_000_000,
        },
      },
    ]);
  });

  it('splits a sibling payment into one row per campus with that campus’s share', () => {
    const rows = paymentRecordedActivity(actor, payment, [
      { campusId: LEKKI, amountMinor: 1_000_000 },
      { campusId: IKEJA, amountMinor: 700_000 },
      { campusId: LEKKI, amountMinor: 300_000 },
    ]);
    expect(
      rows.map((row) => [row.campusId, row.data?.['amountMinor']])
    ).toEqual([
      [LEKKI, 1_300_000],
      [IKEJA, 700_000],
    ]);
    expect(rows.map((row) => row.text)).toEqual([
      'Payment RCT-2026-0012 from Mrs Danjuma recorded by Tunde Bakare: ₦13,000 of it for this campus.',
      'Payment RCT-2026-0012 from Mrs Danjuma recorded by Tunde Bakare: ₦7,000 of it for this campus.',
    ]);
  });

  it('writes the school currency, not naira, for another currency', () => {
    const [row] = paymentRecordedActivity(
      { ...actor, currency: 'GHS' },
      payment,
      [{ campusId: LEKKI, amountMinor: 2_000_000 }]
    );
    expect(row?.text).toBe(
      'Payment RCT-2026-0012 of GHS 20,000 from Mrs Danjuma recorded by Tunde Bakare.'
    );
  });
});

describe('storeSaleRecordedActivity', () => {
  const sale: StoreSaleFacts = {
    id: 'sale-1',
    number: 'ISS-2026-0004',
    paymentId: 'payment-9',
    receiptNumber: 'RCT-2026-0021',
    studentId: 'student-1',
    studentName: 'Bola Ade',
    campusId: LEKKI,
    campusName: 'Lekki',
    itemCount: 3,
    totalMinor: 1_350_000,
  };

  it('writes one finance row on the store campus', () => {
    expect(storeSaleRecordedActivity(actor, sale)).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'store_sale.recorded',
        actorUserId: 'user-1',
        subjectType: 'store_sale',
        subjectId: 'sale-1',
        text: 'Bola Ade bought 3 items at the Lekki store for ₦13,500 (sale ISS-2026-0004, receipt RCT-2026-0021), recorded by Tunde Bakare.',
        data: {
          saleId: 'sale-1',
          number: 'ISS-2026-0004',
          paymentId: 'payment-9',
          receiptNumber: 'RCT-2026-0021',
          studentId: 'student-1',
          amountMinor: 1_350_000,
          items: 3,
        },
      },
    ]);
  });

  it('says "1 item" for a single item', () => {
    const [row] = storeSaleRecordedActivity(actor, { ...sale, itemCount: 1 });
    expect(row?.text).toContain('Bola Ade bought 1 item at the Lekki store');
  });

  it('formats the amount in the school currency', () => {
    const [row] = storeSaleRecordedActivity(
      { ...actor, currency: 'GHS' },
      sale
    );
    expect(row?.text).toContain('for GHS 13,500 (sale');
  });
});

describe('store write-off activity', () => {
  const count: StoreWriteOffFacts = {
    id: 'count-1',
    number: 'CNT-2026-0002',
    storeId: 'store-1',
    campusId: LEKKI,
    campusName: 'Lekki',
  };
  const approved = { netMinor: 450_000, differences: 2, autoApproved: false };

  it('writes one finance row on the store campus for a loss', () => {
    expect(storeWriteOffApprovedActivity(actor, count, approved)).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'store_write_off.approved',
        actorUserId: 'user-1',
        subjectType: 'stock_count',
        subjectId: 'count-1',
        text: 'Store write-off CNT-2026-0002 at the Lekki store: 2 items differ, ₦4,500 lost, approved by Tunde Bakare.',
        data: {
          countId: 'count-1',
          number: 'CNT-2026-0002',
          storeId: 'store-1',
          differences: 2,
          netMinor: 450_000,
          autoApproved: false,
        },
      },
    ]);
  });

  it('words a gain as found and keeps the net signed in the data', () => {
    const [row] = storeWriteOffApprovedActivity(actor, count, {
      ...approved,
      netMinor: -120_000,
    });
    expect(row?.text).toContain('2 items differ, ₦1,200 found, approved by');
    expect(row?.data).toMatchObject({ netMinor: -120_000 });
  });

  it('says "no net value" when the differences cancel out', () => {
    const [row] = storeWriteOffApprovedActivity(actor, count, {
      ...approved,
      netMinor: 0,
    });
    expect(row?.text).toContain('2 items differ, no net value, approved by');
    expect(row?.data).toMatchObject({ netMinor: 0 });
  });

  it('says "applied" when approval is off', () => {
    const [row] = storeWriteOffApprovedActivity(actor, count, {
      ...approved,
      autoApproved: true,
    });
    expect(row?.text).toContain('₦4,500 lost, applied by Tunde Bakare.');
    expect(row?.data).toMatchObject({ autoApproved: true });
  });

  it('says "1 item differs" for a single differing item', () => {
    const [row] = storeWriteOffApprovedActivity(actor, count, {
      ...approved,
      differences: 1,
    });
    expect(row?.text).toContain('at the Lekki store: 1 item differs, ');
  });

  it('formats the amount in the school currency', () => {
    const [row] = storeWriteOffApprovedActivity(
      { ...actor, currency: 'GHS' },
      count,
      approved
    );
    expect(row?.text).toContain('GHS 4,500 lost');
  });

  it('writes the decline with its reason and no amount', () => {
    expect(
      storeWriteOffDeclinedActivity(actor, count, {
        differences: 2,
        reason: 'Recount the shelf first',
      })
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'store_write_off.declined',
        actorUserId: 'user-1',
        subjectType: 'stock_count',
        subjectId: 'count-1',
        text: 'Store write-off CNT-2026-0002 at the Lekki store was declined: Recount the shelf first',
        data: {
          countId: 'count-1',
          number: 'CNT-2026-0002',
          storeId: 'store-1',
          differences: 2,
        },
      },
    ]);
  });

  it('never writes a null campus', () => {
    const rows = [
      ...storeWriteOffApprovedActivity(actor, count, approved),
      ...storeWriteOffDeclinedActivity(actor, count, {
        differences: 1,
        reason: 'No',
      }),
    ];
    expect(rows.map((row) => row.campusId)).toEqual([LEKKI, LEKKI]);
  });
});

describe('paymentCancelledActivity', () => {
  const allocations = [
    { campusId: LEKKI, amountMinor: 1_500_000 },
    { campusId: IKEJA, amountMinor: 500_000 },
  ];

  it('names the approver and flags a decision as not auto-approved', () => {
    const rows = paymentCancelledActivity(actor, payment, {
      allocations,
      autoApproved: false,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      campusId: LEKKI,
      kind: 'payment.cancelled',
      subjectType: 'payment',
      subjectId: 'payment-1',
      text: 'Payment RCT-2026-0012 from Mrs Danjuma (₦15,000 of it for this campus) was cancelled, approved by Tunde Bakare.',
      data: { amountMinor: 1_500_000, autoApproved: false },
    });
    expect(rows[1]).toMatchObject({
      campusId: IKEJA,
      text: 'Payment RCT-2026-0012 from Mrs Danjuma (₦5,000 of it for this campus) was cancelled, approved by Tunde Bakare.',
    });
  });

  it('names the requester and sets autoApproved when approval is off', () => {
    const [row] = paymentCancelledActivity(actor, payment, {
      allocations: [{ campusId: LEKKI, amountMinor: 2_000_000 }],
      autoApproved: true,
    });
    expect(row).toMatchObject({
      text: 'Payment RCT-2026-0012 (₦20,000 from Mrs Danjuma) was cancelled by Tunde Bakare.',
      data: { autoApproved: true },
    });
  });
});

describe('paymentCancellationDeclinedActivity', () => {
  it('records the decline with its reason', () => {
    expect(
      paymentCancellationDeclinedActivity(actor, payment, {
        voidId: 'void-1',
        reason: 'Parent confirmed it is right',
        allocations: [{ campusId: LEKKI, amountMinor: 2_000_000 }],
      })
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'payment_void.declined',
        actorUserId: 'user-1',
        subjectType: 'payment_void',
        subjectId: 'void-1',
        text: 'Cancelling payment RCT-2026-0012 was declined: Parent confirmed it is right',
        data: {
          voidId: 'void-1',
          paymentId: 'payment-1',
          receiptNumber: 'RCT-2026-0012',
          amountMinor: 2_000_000,
        },
      },
    ]);
  });
});

describe('adjustment activity', () => {
  it('records an approval with the kind label, number, student and amount', () => {
    expect(adjustmentApprovedActivity(actor, adjustment, false)).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'adjustment.approved',
        actorUserId: 'user-1',
        subjectType: 'adjustment',
        subjectId: 'adj-1',
        text: 'Reduce a fee ADJ-2026-0003 for Bola Ade, ₦12,000, approved by Tunde Bakare.',
        data: {
          adjustmentId: 'adj-1',
          number: 'ADJ-2026-0003',
          adjustmentKind: 'credit_note',
          studentId: 'student-1',
          amountMinor: 1_200_000,
          autoApproved: false,
        },
      },
    ]);
  });

  it.each([
    ['write_off', 'Cancel a balance'],
    ['refund', 'Refund'],
  ] as const)('labels a %s as "%s"', (kind, label) => {
    const [row] = adjustmentApprovedActivity(
      actor,
      { ...adjustment, kind },
      false
    );
    expect(row?.text).toMatch(new RegExp(`^${label} ADJ-2026-0003`));
  });

  it('says applied and sets autoApproved when approval is off', () => {
    const [row] = adjustmentApprovedActivity(actor, adjustment, true);
    expect(row).toMatchObject({
      kind: 'adjustment.approved',
      text: 'Reduce a fee ADJ-2026-0003 for Bola Ade, ₦12,000, applied by Tunde Bakare.',
      data: { autoApproved: true },
    });
  });

  it('records a decline with its reason', () => {
    expect(adjustmentDeclinedActivity(actor, adjustment, 'Not agreed')).toEqual(
      [
        {
          organizationId: 'org-1',
          campusId: LEKKI,
          pillar: 'finance',
          kind: 'adjustment.declined',
          actorUserId: 'user-1',
          subjectType: 'adjustment',
          subjectId: 'adj-1',
          text: 'Reduce a fee ADJ-2026-0003 for Bola Ade was declined: Not agreed',
          data: {
            adjustmentId: 'adj-1',
            number: 'ADJ-2026-0003',
            adjustmentKind: 'credit_note',
            studentId: 'student-1',
            amountMinor: 1_200_000,
          },
        },
      ]
    );
  });
});

describe('discount activity', () => {
  it('records a percent approval', () => {
    expect(discountApprovedActivity(actor, discount, false)).toEqual([
      {
        organizationId: 'org-1',
        campusId: IKEJA,
        pillar: 'finance',
        kind: 'discount.approved',
        actorUserId: 'user-1',
        subjectType: 'student_discount',
        subjectId: 'disc-1',
        text: 'Discount for Chika Obi (10%) approved by Tunde Bakare.',
        data: {
          discountId: 'disc-1',
          studentId: 'student-2',
          discountKind: 'percent',
          value: 10,
          autoApproved: false,
        },
      },
    ]);
  });

  it('shows a fixed discount in naira and says applied when approval is off', () => {
    const [row] = discountApprovedActivity(
      actor,
      { ...discount, kind: 'fixed', value: 500_000 },
      true
    );
    expect(row).toMatchObject({
      text: 'Discount for Chika Obi (₦5,000) applied by Tunde Bakare.',
      data: { autoApproved: true, value: 500_000 },
    });
  });

  it('records a percent discount ending after its last term', () => {
    expect(
      discountEndedActivity(actor, discount, {
        id: 'term-1',
        label: 'First term 2026/2027',
      })
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: IKEJA,
        pillar: 'finance',
        kind: 'discount.ended',
        actorUserId: 'user-1',
        subjectType: 'student_discount',
        subjectId: 'disc-1',
        text: 'Discount for Chika Obi (10%) ended by Tunde Bakare after First term 2026/2027.',
        data: {
          discountId: 'disc-1',
          studentId: 'student-2',
          discountKind: 'percent',
          value: 10,
          lastTermId: 'term-1',
        },
      },
    ]);
  });

  it('shows a fixed discount ending in naira', () => {
    const [row] = discountEndedActivity(
      actor,
      { ...discount, kind: 'fixed', value: 500_000 },
      { id: 'term-2', label: 'Second term 2026/2027' }
    );
    expect(row).toMatchObject({
      text: 'Discount for Chika Obi (₦5,000) ended by Tunde Bakare after Second term 2026/2027.',
      data: { discountKind: 'fixed', value: 500_000, lastTermId: 'term-2' },
    });
  });

  it('records a decline with its reason', () => {
    expect(discountDeclinedActivity(actor, discount, 'Not agreed')).toEqual([
      {
        organizationId: 'org-1',
        campusId: IKEJA,
        pillar: 'finance',
        kind: 'discount.declined',
        actorUserId: 'user-1',
        subjectType: 'student_discount',
        subjectId: 'disc-1',
        text: 'Discount for Chika Obi was declined: Not agreed',
        data: {
          discountId: 'disc-1',
          studentId: 'student-2',
          discountKind: 'percent',
          value: 10,
        },
      },
    ]);
  });
});

const lekkiLine: FeeLine = {
  id: 'line-1',
  termId: 'term-1',
  classLevelId: 'level-1',
  levelName: 'JSS 1',
  levelSequence: 7,
  feeTypeId: 'type-1',
  feeTypeCode: 4010,
  feeTypeName: 'Tuition',
  campusId: LEKKI,
  campusName: 'Lekki',
  name: 'JSS 1 Tuition',
  amountMinor: 17_000_000,
  appliesTo: 'all',
  isOptional: false,
  retiredAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
};

const everyCampusLine: FeeLine = {
  ...lekkiLine,
  id: 'line-2',
  campusId: null,
  campusName: null,
};

const termLabel = 'First term, 2026/2027';

describe('feeLineCreatedActivity', () => {
  it('writes one finance row for the line’s campus', () => {
    expect(feeLineCreatedActivity(actor, lekkiLine, termLabel)).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'fee_line.created',
        actorUserId: 'user-1',
        subjectType: 'fee_line',
        subjectId: 'line-1',
        text: 'Tunde Bakare added JSS 1 Tuition (Tuition) for JSS 1, Lekki, First term, 2026/2027: ₦170,000.',
        data: {
          feeLineId: 'line-1',
          termId: 'term-1',
          classLevelId: 'level-1',
          feeTypeId: 'type-1',
          amountMinor: 17_000_000,
          appliesTo: 'all',
          isOptional: false,
        },
      },
    ]);
  });

  it('keeps a null campus and says every campus for a school-wide line', () => {
    const [row] = feeLineCreatedActivity(actor, everyCampusLine, termLabel);
    expect(row?.campusId).toBeNull();
    expect(row?.pillar).toBe('finance');
    expect(row?.text).toContain('for JSS 1, every campus, First term');
  });

  it('writes the amount in the school currency', () => {
    const [row] = feeLineCreatedActivity(
      { ...actor, currency: 'USD' },
      lekkiLine,
      termLabel
    );
    expect(row?.text).toBe(
      `Tunde Bakare added JSS 1 Tuition (Tuition) for JSS 1, Lekki, First term, 2026/2027: ${money(17_000_000, 'USD')}.`
    );
    expect(row?.text).not.toContain('₦');
  });
});

describe('feeLineAmountChangedActivity', () => {
  it('names the old and new amount on the line’s campus', () => {
    expect(
      feeLineAmountChangedActivity(
        actor,
        { ...lekkiLine, amountMinor: 18_000_000 },
        { previousAmountMinor: 17_000_000, termLabel }
      )
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'fee_line.amount_changed',
        actorUserId: 'user-1',
        subjectType: 'fee_line',
        subjectId: 'line-1',
        text: 'Tunde Bakare changed JSS 1 Tuition for JSS 1, Lekki, First term, 2026/2027 from ₦170,000 to ₦180,000.',
        data: {
          feeLineId: 'line-1',
          termId: 'term-1',
          previousAmountMinor: 17_000_000,
          amountMinor: 18_000_000,
        },
      },
    ]);
  });

  it('uses a null campus for a school-wide line, in another currency', () => {
    const [row] = feeLineAmountChangedActivity(
      { ...actor, currency: 'USD' },
      { ...everyCampusLine, amountMinor: 20_000 },
      { previousAmountMinor: 10_000, termLabel }
    );
    expect(row?.campusId).toBeNull();
    expect(row?.text).toBe(
      `Tunde Bakare changed JSS 1 Tuition for JSS 1, every campus, First term, 2026/2027 from ${money(10_000, 'USD')} to ${money(20_000, 'USD')}.`
    );
  });
});

describe('feeLineRetiredActivity', () => {
  it('names the retired amount on the line’s campus', () => {
    expect(feeLineRetiredActivity(actor, lekkiLine, termLabel)).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'fee_line.retired',
        actorUserId: 'user-1',
        subjectType: 'fee_line',
        subjectId: 'line-1',
        text: 'Tunde Bakare retired JSS 1 Tuition for JSS 1, Lekki, First term, 2026/2027 (₦170,000).',
        data: {
          feeLineId: 'line-1',
          termId: 'term-1',
          amountMinor: 17_000_000,
        },
      },
    ]);
  });

  it('uses a null campus for a school-wide line, in another currency', () => {
    const [row] = feeLineRetiredActivity(
      { ...actor, currency: 'USD' },
      everyCampusLine,
      termLabel
    );
    expect(row?.campusId).toBeNull();
    expect(row?.text).toContain(
      `every campus, First term, 2026/2027 (${money(17_000_000, 'USD')}).`
    );
  });
});

describe('feeLinesCopiedActivity', () => {
  const terms = {
    from: { id: 'term-1', label: 'First term, 2026/2027' },
    to: { id: 'term-2', label: 'Second term, 2026/2027' },
  };

  it('writes one row about the target term when every copied line is every-campus', () => {
    expect(
      feeLinesCopiedActivity(actor, terms, [{ campusId: null, count: 12 }])
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: null,
        pillar: 'finance',
        kind: 'fee_lines.copied',
        actorUserId: 'user-1',
        subjectType: 'term',
        subjectId: 'term-2',
        text: 'Tunde Bakare copied 12 fee lines from First term, 2026/2027 to Second term, 2026/2027.',
        data: { fromTermId: 'term-1', toTermId: 'term-2', copied: 12 },
      },
    ]);
  });

  it('says "1 fee line" for a single copied line', () => {
    const [row] = feeLinesCopiedActivity(actor, terms, [
      { campusId: LEKKI, count: 1 },
    ]);
    expect(row?.text).toContain('copied 1 fee line from');
  });

  it('writes one row per campus with that campus’s own count', () => {
    const rows = feeLinesCopiedActivity(actor, terms, [
      { campusId: null, count: 3 },
      { campusId: LEKKI, count: 2 },
      { campusId: IKEJA, count: 1 },
    ]);
    expect(
      rows.map((row) => [row.campusId, row.data?.['copied'], row.text])
    ).toEqual([
      [
        null,
        3,
        'Tunde Bakare copied 3 fee lines from First term, 2026/2027 to Second term, 2026/2027 (for every campus).',
      ],
      [
        LEKKI,
        2,
        'Tunde Bakare copied 2 fee lines from First term, 2026/2027 to Second term, 2026/2027 (for this campus).',
      ],
      [
        IKEJA,
        1,
        'Tunde Bakare copied 1 fee line from First term, 2026/2027 to Second term, 2026/2027 (for this campus).',
      ],
    ]);
  });

  it('writes nothing when no line was copied', () => {
    expect(feeLinesCopiedActivity(actor, terms, [])).toEqual([]);
  });
});

describe('oneOffChargeActivity', () => {
  const charge: OneOffChargeFacts = {
    id: 'invoice-1',
    number: 'CHG-2026-0031',
    studentId: 'student-1',
    studentName: 'Bola Ade',
    campusId: LEKKI,
    totalMinor: 1_750_000,
  };

  it('writes one finance row on the student’s campus', () => {
    expect(oneOffChargeActivity(actor, charge)).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'charge.adhoc',
        actorUserId: 'user-1',
        subjectType: 'invoice',
        subjectId: 'invoice-1',
        text: 'Charged Bola Ade ₦17,500 (CHG-2026-0031)',
        data: {
          invoiceId: 'invoice-1',
          number: 'CHG-2026-0031',
          studentId: 'student-1',
          amountMinor: 1_750_000,
        },
      },
    ]);
  });

  it('formats the amount in the school currency', () => {
    const [row] = oneOffChargeActivity({ ...actor, currency: 'GHS' }, charge);
    expect(row?.text).toBe(
      `Charged Bola Ade ${money(1_750_000, 'GHS')} (CHG-2026-0031)`
    );
  });
});

describe('feeTypeCreatedActivity', () => {
  it('writes one school-wide finance row naming the type and its code', () => {
    expect(
      feeTypeCreatedActivity(actor, {
        id: 'type-9',
        code: 4090,
        name: 'Sports levy',
      })
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: null,
        pillar: 'finance',
        kind: 'fee_type.created',
        actorUserId: 'user-1',
        subjectType: 'fee_type',
        subjectId: 'type-9',
        text: 'Tunde Bakare added the fee type Sports levy (4090).',
        data: { feeTypeId: 'type-9', code: 4090, name: 'Sports levy' },
      },
    ]);
  });
});

describe('feeOptionChangedActivity', () => {
  const facts = {
    student: { id: 'student-1', name: 'Bola Ade', campusId: LEKKI },
    feeType: { id: 'type-bus', name: 'School bus' },
    enrollmentId: 'enrol-1',
  };

  it('writes an opt-in row on the student’s campus', () => {
    expect(
      feeOptionChangedActivity(actor, { ...facts, optedIn: true })
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'fee_option.opted_in',
        actorUserId: 'user-1',
        subjectType: 'student',
        subjectId: 'student-1',
        text: 'Tunde Bakare opted Bola Ade into School bus.',
        data: {
          studentId: 'student-1',
          feeTypeId: 'type-bus',
          enrollmentId: 'enrol-1',
          optedIn: true,
        },
      },
    ]);
  });

  it('writes an opt-out row on the student’s campus', () => {
    expect(
      feeOptionChangedActivity(actor, { ...facts, optedIn: false })
    ).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'fee_option.opted_out',
        actorUserId: 'user-1',
        subjectType: 'student',
        subjectId: 'student-1',
        text: 'Tunde Bakare opted Bola Ade out of School bus.',
        data: {
          studentId: 'student-1',
          feeTypeId: 'type-bus',
          enrollmentId: 'enrol-1',
          optedIn: false,
        },
      },
    ]);
  });
});
