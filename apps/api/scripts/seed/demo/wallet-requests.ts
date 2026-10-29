import { FilesService } from '../../../src/app/common/files/files.service';
import { WalletRefundService } from '../../../src/app/modules/wallet/wallet-refund.service';
import { WalletTopUpCancellationService } from '../../../src/app/modules/wallet/wallet-topup-cancellation.service';
import {
  mustFind,
  moveClock,
  staffContext,
  type DemoRun,
  type PeopleFacts,
  type SchoolFacts,
} from './demo-run';
import { bursarOf, proofOf, type MoneyFacts } from './money';
import { oldestFirst } from './ordering';
import { familyOf, payerEmailOf } from './people-plan';
import { topUp, walletContext, type WalletRun } from './wallets';
import type { WalletRequestPlan } from './wallet-requests-plan';

async function ask(
  context: WalletRun,
  request: WalletRequestPlan
): Promise<string> {
  const { run, money, walletIds, people } = context;
  const wallet = mustFind(
    run.plan.wallets.find((row) => row.number === request.wallet),
    `wallet ${request.wallet}`
  );
  const family = familyOf(run.plan.families, wallet.family);
  const bursar = bursarOf(money, family.campus);
  const walletId = mustFind(
    walletIds.get(mustFind(people.payerIds.get(wallet.family), 'payer')),
    `wallet of family ${wallet.family}`
  );
  const topUpId = await topUp(context, wallet, {
    reference: `DEMO-TOPUP-${wallet.number}-REQ${request.number}`,
    amountMinor: request.amountMinor,
    daysAgo: request.daysAgo,
  });
  if (request.kind === 'cancellation') {
    const { request: made } = await run.app
      .get(WalletTopUpCancellationService, { strict: false })
      .request(
        bursar,
        { walletId, topUpId },
        { reference: `DEMO-CANCEL-${request.number}`, reason: request.reason }
      );
    return made.id;
  }
  const proof = await run.app
    .get(FilesService, { strict: false })
    .upload(bursar, {
      kind: 'wallet_refund_request',
      file: proofOf(`demo-refund-${request.number}`),
    });
  const { request: made } = await run.app
    .get(WalletRefundService, { strict: false })
    .request(bursar, walletId, {
      reference: `DEMO-REFUND-${request.number}`,
      moneyAccountId: mustFind(
        money.bankAccounts.get(family.campus),
        `bank account for ${family.campus}`
      ),
      amountMinor: request.amountMinor,
      parentEmail: payerEmailOf(family),
      reason: request.reason,
      proofFileId: proof.id,
    });
  return made.id;
}

export async function runWalletRequests(
  run: DemoRun,
  facts: { school: SchoolFacts; people: PeopleFacts; money: MoneyFacts }
): Promise<void> {
  const context = await walletContext(run, facts);
  const principal = await staffContext(run, 'principal');
  const refunds = run.app.get(WalletRefundService, { strict: false });
  const cancellations = run.app.get(WalletTopUpCancellationService, {
    strict: false,
  });
  for (const request of oldestFirst(
    run.plan.walletRequests,
    (row) => row.daysAgo
  )) {
    moveClock(run, request.daysAgo);
    const id = await ask(context, request);
    if (request.state === 'pending') {
      continue;
    }
    moveClock(run, mustFind(request.decidedDaysAgo, 'decision day'));
    if (request.state === 'declined') {
      const reason = mustFind(request.declineReason, 'decline reason');
      await (request.kind === 'refund'
        ? refunds.decline(principal, id, reason)
        : cancellations.decline(principal, id, reason));
    } else if (request.kind === 'refund') {
      await refunds.approve(principal, id, {
        payoutReference: `DEMO-PAYOUT-${request.number}`,
      });
    } else {
      await cancellations.approve(principal, id);
    }
  }
}
