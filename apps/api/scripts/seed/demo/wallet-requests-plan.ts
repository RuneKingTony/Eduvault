import { AMOUNT_STEP_MINOR, type WalletPlan } from './money-plan';
import type { ApprovalState } from './approvals-plan';

export interface WalletRequestPlan {
  /** 1-based, and the number in the DEMO-REFUND and DEMO-CANCEL references. */
  number: number;
  kind: 'refund' | 'cancellation';
  state: ApprovalState;
  wallet: WalletPlan['number'];
  /** A refund pays this out; a cancellation reverses an extra top-up of this size. */
  amountMinor: number;
  reason: string;
  daysAgo: number;
  /** Null while the request is waiting. */
  decidedDaysAgo: number | null;
  declineReason: string | null;
}

type Template = Pick<WalletRequestPlan, 'kind' | 'state' | 'reason'> & {
  steps: number;
};

const TEMPLATES: readonly Template[] = [
  {
    kind: 'refund',
    state: 'approved',
    steps: 2,
    reason: 'Family is leaving the school',
  },
  {
    kind: 'refund',
    state: 'pending',
    steps: 1,
    reason: 'Paid into the wallet twice',
  },
  {
    kind: 'refund',
    state: 'declined',
    steps: 3,
    reason: 'Parent asked for the money back',
  },
  {
    kind: 'cancellation',
    state: 'approved',
    steps: 2,
    reason: 'Deposit slip was for another family',
  },
  {
    kind: 'cancellation',
    state: 'pending',
    steps: 1,
    reason: 'Transfer did not clear',
  },
  {
    kind: 'cancellation',
    state: 'declined',
    steps: 3,
    reason: 'Teller entered the wrong amount',
  },
];

const DECLINE_REASON = 'The proof does not match the request.';

/**
 * Each request is funded by its own extra top-up, so a refund or a
 * cancellation never depends on how much the wallet spent. Wallets with
 * auto-pay are left out, which keeps their balances exact. No draws from the
 * shared PRNG: the rest of the school stays as it was.
 */
export function planWalletRequests(
  wallets: readonly WalletPlan[]
): WalletRequestPlan[] {
  const plain = wallets.filter((wallet) => wallet.autoPay === null);
  return TEMPLATES.flatMap((template, index): WalletRequestPlan[] => {
    const wallet = plain[index % plain.length];
    if (wallet === undefined) {
      return [];
    }
    return [
      {
        number: index + 1,
        kind: template.kind,
        state: template.state,
        wallet: wallet.number,
        amountMinor: template.steps * AMOUNT_STEP_MINOR,
        reason: template.reason,
        daysAgo: wallet.daysAgo,
        decidedDaysAgo:
          template.state === 'pending' ? null : Math.max(1, wallet.daysAgo - 1),
        declineReason: template.state === 'declined' ? DECLINE_REASON : null,
      },
    ];
  });
}

/** What the plan says a wallet holds back, and what its extra top-ups add. */
export function requestEffects(
  requests: readonly WalletRequestPlan[],
  wallet: WalletPlan['number']
): { balanceMinor: number; heldMinor: number } {
  let balanceMinor = 0;
  let heldMinor = 0;
  for (const request of requests) {
    if (request.wallet !== wallet) {
      continue;
    }
    if (request.state !== 'approved') {
      balanceMinor += request.amountMinor;
    }
    if (request.state === 'pending') {
      heldMinor += request.amountMinor;
    }
  }
  return { balanceMinor, heldMinor };
}
