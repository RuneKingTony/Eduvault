import { APPROVAL_KINDS, type ApprovalItem } from '@eduvault/api-contract';
import { APPROVAL_KIND_UI, DECLINED_TOAST, amountOf } from './approval-copy';

const item = (over: Partial<ApprovalItem> = {}): ApprovalItem => ({
  kind: 'write_off',
  id: 'a',
  label: 'Cancel a balance',
  details: 'Bola Johnson: Family moved',
  amountMinor: 1_200_000,
  amountText: null,
  createdBy: { id: 'chika', name: 'Chika Eze' },
  createdAt: '2026-10-16T08:00:00.000Z',
  campusId: null,
  decide: 'yes',
  ...over,
});

describe('approval copy', () => {
  it('has an effect line and a toast for every kind', () => {
    for (const kind of APPROVAL_KINDS) {
      expect(APPROVAL_KIND_UI[kind].approveEffect).not.toBe('');
      expect(APPROVAL_KIND_UI[kind].approvedToast.message).not.toBe('');
      expect(APPROVAL_KIND_UI[kind].declineEffect).not.toBe('');
    }
  });

  it('says in the PRD words what each approval does', () => {
    expect(APPROVAL_KIND_UI.payment_void.approveEffect).toBe(
      'The receipt is kept but marked cancelled, and the family owes that money again.'
    );
    expect(APPROVAL_KIND_UI.refund.approveEffect).toBe(
      'Posts the refund from the money account and reduces the credit held for the student.'
    );
    expect(APPROVAL_KIND_UI.discount.approveEffect).toBe(
      'Applies the discount to the student from the next round of charges.'
    );
  });

  it('toasts each kind’s outcome with the right follow-up', () => {
    expect(APPROVAL_KIND_UI.payment_void.approvedToast).toEqual({
      message: 'Approved. The payment is cancelled and the receipt is kept.',
      action: { label: 'Payments', to: '/finance/payments' },
    });
    for (const kind of ['credit_note', 'write_off', 'refund'] as const) {
      expect(APPROVAL_KIND_UI[kind].approvedToast).toEqual({
        message: 'Approved. The student’s fees have been updated.',
        action: { label: 'Who owes', to: '/finance/accounts' },
      });
    }
    expect(APPROVAL_KIND_UI.discount.approvedToast).toEqual({
      message: 'Discount approved.',
      action: null,
    });
    expect(DECLINED_TOAST).toBe(
      'Declined. The request is kept with your reason.'
    );
  });
});

describe('where each kind is decided and listed', () => {
  it('names the API resource and the Discounts and refunds tab of every kind', () => {
    expect(
      APPROVAL_KINDS.map((kind) => [
        kind,
        APPROVAL_KIND_UI[kind].resource,
        APPROVAL_KIND_UI[kind].tab,
      ])
    ).toEqual([
      ['payment_void', 'paymentVoids', 'voids'],
      ['credit_note', 'adjustments', 'corrections'],
      ['write_off', 'adjustments', 'corrections'],
      ['refund', 'adjustments', 'corrections'],
      ['discount', 'studentDiscounts', 'discounts'],
    ]);
  });
});

describe('amountOf', () => {
  it('shows naira for an amount and the text for a discount', () => {
    expect(amountOf(item(), 'NGN')).toBe('₦12,000');
    expect(
      amountOf(item({ amountMinor: null, amountText: '5% off' }), 'NGN')
    ).toBe('5% off');
    expect(amountOf(item({ amountMinor: null, amountText: null }), 'NGN')).toBe(
      ''
    );
  });
});
