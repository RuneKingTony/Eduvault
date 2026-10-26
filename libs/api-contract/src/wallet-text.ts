import { fmtLagosDateTime, walletMoney } from '@eduvault/shared';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from './schemas';
import type { PortalWalletMovementSource } from './wallets';

type MonnifySource = Extract<PortalWalletMovementSource, { type: 'monnify' }>;

interface TitledMovement {
  studentName: string | null;
  source:
    | { type: 'topup'; method: PaymentMethod; depositorName: string | null }
    | { type: 'monnify' }
    | { type: 'spend'; automatic?: boolean }
    | { type: 'refund' }
    | { type: 'topup_cancellation' }
    | { type: 'credit_migration'; childCount: number }
    | null;
}

const FIXED_TITLES: Partial<
  Record<NonNullable<TitledMovement['source']>['type'], string>
> = {
  monnify: 'Online top-up · Monnify',
  refund: 'Refund paid out',
  topup_cancellation: 'Top-up cancelled',
};

function ownTitle(source: TitledMovement['source']): string | undefined {
  if (source?.type === 'topup') {
    const from =
      source.depositorName === null ? '' : ` from ${source.depositorName}`;
    return `Top-up${from} · ${PAYMENT_METHOD_LABELS[source.method]}`;
  }
  if (source?.type === 'credit_migration') {
    return source.childCount === 1
      ? 'Credit moved from 1 child’s account'
      : `Credit moved from ${source.childCount} children’s accounts`;
  }
  return source === null ? undefined : FIXED_TITLES[source.type];
}

export function movementTitle({ source, studentName }: TitledMovement): string {
  const own = ownTitle(source);
  if (own !== undefined) {
    return own;
  }
  const verb =
    source?.type === 'spend' && source.automatic === true
      ? 'Auto-paid'
      : 'Paid';
  return studentName === null
    ? `${verb} from wallet`
    : `${verb} ${studentName}’s charges`;
}

export interface TraceFact {
  label: string;
  value: string;
  mono: boolean;
}

export function traceFacts(
  source: MonnifySource,
  options: { reference: string; currency: string }
): TraceFact[] {
  const { reference, currency } = options;
  return [
    {
      label: 'Monnify reference',
      value: source.transactionReference,
      mono: true,
    },
    { label: 'Payment reference', value: source.paymentReference, mono: true },
    { label: 'Signature check', value: 'Valid', mono: false },
    {
      label: 'Confirmation',
      value: `Checked with Monnify on ${fmtLagosDateTime(source.confirmedAt)}`,
      mono: false,
    },
    { label: 'Paid on', value: fmtLagosDateTime(source.paidAt), mono: false },
    {
      label: 'Paid by the family',
      value: walletMoney(source.grossMinor, currency),
      mono: false,
    },
    {
      label: 'Monnify fee',
      value: walletMoney(source.feeMinor, currency),
      mono: false,
    },
    {
      label: 'Credited to the wallet',
      value: walletMoney(source.netMinor, currency),
      mono: false,
    },
    { label: 'Journal entry', value: reference, mono: true },
  ];
}
