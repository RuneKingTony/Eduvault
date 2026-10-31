import type { OrgContext } from '../../../src/app/common/auth';
import { FilesService } from '../../../src/app/common/files/files.service';
import { WalletPortalService } from '../../../src/app/modules/wallet/wallet-portal.service';
import { WalletService } from '../../../src/app/modules/wallet/wallet.service';
import { orgContextFor } from '../actors';
import {
  mustFind,
  moveClock,
  progressLogger,
  type DemoRun,
  type PeopleFacts,
  type SchoolFacts,
} from './demo-run';
import { accountFor, bursarOf, proofOf, type MoneyFacts } from './money';
import type { WalletPlan } from './money-plan';
import { oldestFirst } from './ordering';
import {
  familyOf,
  payerEmailOf,
  payerOf,
  type StudentNumber,
} from './people-plan';
import { databaseOf } from '../database';

const PROGRESS_EVERY = 20;

export interface WalletRun {
  run: DemoRun;
  school: SchoolFacts;
  people: PeopleFacts;
  money: MoneyFacts;
  walletIds: ReadonlyMap<string, string>;
}

export async function topUp(
  context: WalletRun,
  wallet: WalletPlan,
  top: { reference: string; amountMinor: number; daysAgo: number }
): Promise<string> {
  const { run, money, walletIds, people } = context;
  const family = familyOf(run.plan.families, wallet.family);
  const bursar = bursarOf(money, family.campus);
  const guardianId = mustFind(people.payerIds.get(wallet.family), 'payer');
  const day = moveClock(run, top.daysAgo);
  const proof = await run.app
    .get(FilesService, { strict: false })
    .upload(bursar, {
      kind: 'wallet_proof',
      file: proofOf(top.reference.toLowerCase()),
    });
  const topped = await run.app
    .get(WalletService, { strict: false })
    .topUp(
      bursar,
      mustFind(walletIds.get(guardianId), `wallet of family ${wallet.family}`),
      {
        reference: top.reference,
        moneyAccountId: accountFor(money, family.campus, wallet),
        method: wallet.method,
        amountMinor: top.amountMinor,
        receivedOn: day,
        depositorName: payerOf(family).fullName,
        proofFileId: proof.id,
      }
    );
  return topped.id;
}

async function guardianActs(
  context: WalletRun,
  wallet: WalletPlan,
  guardian: OrgContext
): Promise<void> {
  const portal = context.run.app.get(WalletPortalService, { strict: false });
  const studentOf = (child: StudentNumber) =>
    mustFind(context.people.studentIds.get(child), `student ${child}`);
  await portal.spend(guardian, {
    reference: `DEMO-SPEND-${wallet.number}`,
    lines: [
      {
        studentId: studentOf(wallet.spend.child),
        amountMinor: wallet.spend.amountMinor,
      },
    ],
  });
  if (wallet.setAside !== null) {
    await portal.setAside(guardian, {
      reference: `DEMO-ASIDE-${wallet.number}`,
      studentId: studentOf(wallet.setAside.child),
      amountMinor: wallet.setAside.amountMinor,
    });
  }
  if (wallet.autoPay !== null) {
    await portal.setAutoPay(guardian, {
      enabled: true,
      reference: `DEMO-AUTOPAY-${wallet.number}`,
    });
  }
}

async function runWallet(
  context: WalletRun,
  wallet: WalletPlan
): Promise<void> {
  const email = payerEmailOf(
    familyOf(context.run.plan.families, wallet.family)
  );
  await topUp(context, wallet, {
    reference: `DEMO-TOPUP-${wallet.number}`,
    amountMinor: wallet.topUpMinor,
    daysAgo: wallet.daysAgo,
  });
  await guardianActs(
    context,
    wallet,
    await orgContextFor(context.run.app, email)
  );
  if (wallet.autoPay !== null) {
    await topUp(context, wallet, {
      reference: `DEMO-TOPUP-${wallet.number}-AUTO`,
      amountMinor: wallet.autoPay.secondTopUpMinor,
      daysAgo: wallet.daysAgo,
    });
  }
}

export async function walletContext(
  run: DemoRun,
  facts: { school: SchoolFacts; people: PeopleFacts; money: MoneyFacts }
): Promise<WalletRun> {
  const db = databaseOf(run.app);
  const rows = await db
    .selectFrom('wallet')
    .select(['id', 'guardian_id'])
    .where('organization_id', '=', facts.school.organizationId)
    .execute();
  return {
    run,
    ...facts,
    walletIds: new Map(rows.map((row) => [row.guardian_id, row.id])),
  };
}

export async function runWallets(
  run: DemoRun,
  facts: { school: SchoolFacts; people: PeopleFacts; money: MoneyFacts }
): Promise<void> {
  const context = await walletContext(run, facts);
  const ordered = oldestFirst(run.plan.wallets, (wallet) => wallet.daysAgo);
  const logProgress = progressLogger(run, ordered.length, {
    every: PROGRESS_EVERY,
    line: (done) => `  ${done} of ${ordered.length} wallets done`,
  });
  for (const wallet of ordered) {
    await runWallet(context, wallet);
    logProgress();
  }
}
