import type { INestApplication } from '@nestjs/common';
import type {
  ActivityPage,
  CreateMoneyAccountInput,
  MoneyAccount,
  OpeningBalancesInput,
  OpeningBalancesResult,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import { KYSELY_TOKEN, type Database } from '../../../src/app/common/db/tokens';
import {
  LedgerPoster,
  type PostInput,
  type PostResult,
} from '../../../src/app/common/ledger';
import { LedgerService } from '../../../src/app/modules/ledger/ledger.service';
import { MoneyAccountService } from '../../../src/app/modules/money-account/money-account.service';
import type { Fixtures, TestUser } from '../base-test';
import { orgContextFor } from './org-context';

export async function ledgerAccountId(
  pool: Pool,
  organizationId: string,
  code: number
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM ledger_account WHERE organization_id = $1 AND code = $2',
    [organizationId, code]
  );
  const [row] = rows;
  if (row === undefined) {
    throw new Error(`No ledger account ${code}`);
  }
  return row.id;
}

export async function createMoneyAccount(
  app: INestApplication,
  actor: { cookie: string },
  input: Partial<CreateMoneyAccountInput> &
    Pick<CreateMoneyAccountInput, 'name'>
): Promise<MoneyAccount> {
  const ctx = await orgContextFor(app, actor);
  return app.get(MoneyAccountService, { strict: false }).create(ctx, {
    kind: 'bank',
    campusId: null,
    ...input,
  });
}

export async function postEntry(
  app: INestApplication,
  input: PostInput
): Promise<PostResult> {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const poster = app.get(LedgerPoster, { strict: false });
  return db.transaction().execute((trx) => poster.post(trx, input));
}

export async function importOpening(
  app: INestApplication,
  actor: { cookie: string },
  input: OpeningBalancesInput
): Promise<OpeningBalancesResult> {
  const ctx = await orgContextFor(app, actor);
  return app.get(LedgerService, { strict: false }).postOpening(ctx, {
    items: input.items ?? [],
    moneyAccounts: input.moneyAccounts ?? [],
  });
}

export interface FinanceActivityRow {
  kind: string;
  campus_id: string | null;
  subject_type: string;
  subject_id: string;
  text: string;
  data: Record<string, unknown>;
}

export async function financeActivityRows(
  pool: Pool,
  organizationId: string
): Promise<FinanceActivityRow[]> {
  const { rows } = await pool.query<FinanceActivityRow>(
    `SELECT kind, campus_id, subject_type, subject_id, text, data
     FROM activity_event
     WHERE organization_id = $1 AND pillar = 'finance'
     ORDER BY kind, campus_id`,
    [organizationId]
  );
  return rows;
}

export async function financeTexts(
  api: Fixtures['api'],
  actor: TestUser
): Promise<string[]> {
  const page = (await api(actor).get('/activity?page=1').expect(200))
    .body as ActivityPage;
  return page.items
    .filter((item) => item.pillar === 'finance')
    .map((item) => item.text)
    .toSorted((a, b) => a.localeCompare(b));
}
