import { ADJUSTMENT_KIND_LABELS } from './adjustment-kinds';
import { contract } from './contract';
import {
  ADJUSTMENT_REASON_MESSAGE,
  ADJUSTMENT_STUDENT_AMOUNT_MESSAGE,
  DISCOUNT_PERCENT_MESSAGE,
  DISCOUNT_VALUE_MESSAGE,
  adjustmentListQuerySchema,
  adjustmentRefundCapMessage,
  adjustmentRefundNowCapMessage,
  adjustmentWriteOffCapMessage,
  createAdjustmentSchema,
  createStudentDiscountSchema,
  endStudentDiscountSchema,
  studentDiscountListQuerySchema,
} from './adjustments';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

const adjustment = {
  kind: 'credit_note',
  studentId: id,
  amountMinor: 1_000_000,
  reason: 'Late enrolment',
};

describe('createAdjustmentSchema', () => {
  it('accepts a reduction and trims the reason', () => {
    expect(
      createAdjustmentSchema.parse({
        ...adjustment,
        reason: ' Late enrolment ',
      }).reason
    ).toBe('Late enrolment');
  });

  it('trims a client reference and refuses a system one', () => {
    expect(
      createAdjustmentSchema.parse({ ...adjustment, reference: ' DEMO-ADJ-1 ' })
        .reference
    ).toBe('DEMO-ADJ-1');
    expect(
      createAdjustmentSchema.safeParse({ ...adjustment, reference: 'ADJ-1' })
        .success
    ).toBe(false);
  });

  it('accepts the optional accounts and charge', () => {
    expect(
      createAdjustmentSchema.safeParse({
        ...adjustment,
        ledgerAccountId: id,
        invoiceId: id,
      }).success
    ).toBe(true);
    expect(
      createAdjustmentSchema.safeParse({
        kind: 'refund',
        studentId: id,
        amountMinor: 500_000,
        reason: 'Overpaid',
        moneyAccountId: id,
      }).success
    ).toBe(true);
  });

  it('refuses a zero, negative or fractional amount', () => {
    for (const amountMinor of [0, -5, 10.5]) {
      expect(
        messages(
          createAdjustmentSchema.safeParse({ ...adjustment, amountMinor })
        )
      ).toEqual([ADJUSTMENT_STUDENT_AMOUNT_MESSAGE]);
    }
  });

  it('refuses a blank reason and one over 200 characters', () => {
    expect(
      messages(createAdjustmentSchema.safeParse({ ...adjustment, reason: ' ' }))
    ).toEqual([ADJUSTMENT_REASON_MESSAGE]);
    expect(
      createAdjustmentSchema.safeParse({
        ...adjustment,
        reason: 'a'.repeat(201),
      }).success
    ).toBe(false);
  });

  it('refuses a kind outside the three', () => {
    expect(
      createAdjustmentSchema.safeParse({ ...adjustment, kind: 'gift' }).success
    ).toBe(false);
  });
});

describe('createStudentDiscountSchema', () => {
  const discount = {
    studentId: id,
    kind: 'percent',
    value: 50,
    ledgerAccountId: id,
    fromTermId: id,
    reason: 'Staff child',
  };

  it('accepts a percentage from 1 to 100 and a fixed amount', () => {
    expect(createStudentDiscountSchema.safeParse(discount).success).toBe(true);
    expect(
      createStudentDiscountSchema.safeParse({ ...discount, value: 100 }).success
    ).toBe(true);
    expect(
      createStudentDiscountSchema.safeParse({
        ...discount,
        kind: 'fixed',
        value: 1_500_000,
        ledgerAccountId: null,
        toTermId: id,
      }).success
    ).toBe(true);
  });

  it('refuses a percentage above 100', () => {
    expect(
      messages(
        createStudentDiscountSchema.safeParse({ ...discount, value: 120 })
      )
    ).toEqual([DISCOUNT_PERCENT_MESSAGE]);
  });

  it('refuses a zero, negative or fractional value', () => {
    for (const value of [0, -1, 2.5]) {
      expect(
        messages(createStudentDiscountSchema.safeParse({ ...discount, value }))
      ).toEqual([DISCOUNT_VALUE_MESSAGE]);
    }
  });

  it('refuses a blank reason', () => {
    expect(
      messages(
        createStudentDiscountSchema.safeParse({ ...discount, reason: '  ' })
      )
    ).toEqual([ADJUSTMENT_REASON_MESSAGE]);
  });
});

describe('endStudentDiscountSchema', () => {
  it('needs the last term', () => {
    expect(endStudentDiscountSchema.parse({ lastTermId: id })).toEqual({
      lastTermId: id,
    });
    expect(endStudentDiscountSchema.safeParse({}).success).toBe(false);
  });
});

describe('list queries', () => {
  it('default to page 1 and 10 rows and refuse an unknown status', () => {
    expect(adjustmentListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    });
    expect(studentDiscountListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    });
    expect(
      adjustmentListQuerySchema.safeParse({ status: 'gone' }).success
    ).toBe(false);
  });
});

describe('adjustment copy', () => {
  it('labels the three kinds in the PRD words', () => {
    expect(ADJUSTMENT_KIND_LABELS).toEqual({
      credit_note: 'Reduce a fee',
      write_off: 'Cancel a balance',
      refund: 'Refund',
    });
  });

  it('writes the cap messages with the name and the naira amount', () => {
    expect(adjustmentRefundCapMessage('David Eze', 500_000)).toBe(
      'A refund pays back credit held. David Eze holds ₦5,000 credit.'
    );
    expect(adjustmentWriteOffCapMessage('Bola Ade', 1_200_000)).toBe(
      'You can cancel at most what Bola Ade owes: ₦12,000.'
    );
    expect(adjustmentRefundNowCapMessage('David Eze', 100_000)).toBe(
      'David Eze now holds ₦1,000 credit, less than this refund. Decline it and ask again.'
    );
  });
});

describe('contract.adjustments and contract.studentDiscounts', () => {
  it('serve the finance routes of the PRD', () => {
    expect(contract.adjustments.list.path).toBe('/finance/adjustments');
    expect(contract.adjustments.get.path).toBe('/finance/adjustments/:id');
    expect(contract.adjustments.approve.path).toBe(
      '/finance/adjustments/:id/approve'
    );
    expect(contract.adjustments.decline.method).toBe('POST');
    expect(contract.studentDiscounts.list.path).toBe('/finance/discounts');
    expect(contract.studentDiscounts.end.path).toBe(
      '/finance/discounts/:id/end'
    );
  });
});
