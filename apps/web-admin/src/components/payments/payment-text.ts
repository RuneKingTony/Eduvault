import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type PaymentStatus,
} from '@eduvault/api-contract';

export const METHOD_ROWS: readonly {
  method: PaymentMethod;
  label: string;
  description: string;
}[] = [
  {
    method: 'cash',
    label: PAYMENT_METHOD_LABELS.cash,
    description: 'Paid in person at the bursary.',
  },
  {
    method: 'transfer',
    label: PAYMENT_METHOD_LABELS.transfer,
    description: 'Staff add the proof of transfer when they record it.',
  },
  {
    method: 'pos',
    label: PAYMENT_METHOD_LABELS.pos,
    description: 'Card payments on the school’s POS machine.',
  },
];

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  posted: 'Recorded',
  void_pending: 'Cancellation waiting',
  voided: 'Cancelled',
};
