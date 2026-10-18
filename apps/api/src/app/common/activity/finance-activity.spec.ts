import {
  adjustmentApprovedActivity,
  adjustmentDeclinedActivity,
  discountApprovedActivity,
  discountDeclinedActivity,
  paymentCancellationDeclinedActivity,
  paymentCancelledActivity,
  paymentRecordedActivity,
  roundSentActivity,
  type AdjustmentFacts,
  type DiscountFacts,
  type FinanceActor,
  type PaymentFacts,
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
  it('records the decline without the reason', () => {
    expect(
      paymentCancellationDeclinedActivity(actor, payment, {
        voidId: 'void-1',
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
        text: 'Cancelling payment RCT-2026-0012 was declined by Tunde Bakare.',
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

  it('records a decline without the reason', () => {
    expect(adjustmentDeclinedActivity(actor, adjustment)).toEqual([
      {
        organizationId: 'org-1',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'adjustment.declined',
        actorUserId: 'user-1',
        subjectType: 'adjustment',
        subjectId: 'adj-1',
        text: 'Reduce a fee ADJ-2026-0003 for Bola Ade was declined by Tunde Bakare.',
        data: {
          adjustmentId: 'adj-1',
          number: 'ADJ-2026-0003',
          adjustmentKind: 'credit_note',
          studentId: 'student-1',
          amountMinor: 1_200_000,
        },
      },
    ]);
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

  it('records a decline without the reason', () => {
    expect(discountDeclinedActivity(actor, discount)).toEqual([
      {
        organizationId: 'org-1',
        campusId: IKEJA,
        pillar: 'finance',
        kind: 'discount.declined',
        actorUserId: 'user-1',
        subjectType: 'student_discount',
        subjectId: 'disc-1',
        text: 'Discount for Chika Obi was declined by Tunde Bakare.',
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
