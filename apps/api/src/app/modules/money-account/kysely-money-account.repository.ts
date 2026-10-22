import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  MONEY_ACCOUNTS_SYSTEM_KEY,
  journalKindSchema,
  moneyAccountKindSchema,
  type CashBookItem,
  type MoneyAccount,
  type MoneyAccountList,
} from '@eduvault/api-contract';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  insertChildAccount,
  schoolCurrency,
  transactAccounts,
} from '../../common/ledger';
import {
  MoneyAccountRepository,
  type MoneyAccountChange,
  type MoneyAccountOutcome,
  type MoneyAccountScope,
  type NewMoneyAccount,
  type RecordingOption,
} from './money-account.repository';

interface AccountRow {
  id: string;
  name: string;
  kind: string;
  campus_id: string | null;
  campus_name: string | null;
  bank_name: string | null;
  account_last4: string | null;
  ledger_account_id: string;
  ledger_code: number;
  balance: string;
  retired_at: Date | null;
}

const toAccount = (row: AccountRow): MoneyAccount => ({
  id: row.id,
  name: row.name,
  kind: moneyAccountKindSchema.parse(row.kind),
  campusId: row.campus_id,
  campusName: row.campus_name,
  bankName: row.bank_name,
  last4: row.account_last4,
  ledgerAccountId: row.ledger_account_id,
  ledgerCode: row.ledger_code,
  balanceMinor: Number(row.balance),
  retiredAt: row.retired_at === null ? null : iso(row.retired_at),
});

interface CashRow {
  entry_id: string;
  reference: string;
  kind: string;
  memo: string | null;
  effective_on: string;
  in_minor: string;
  out_minor: string;
  running_minor: string;
  payment_id: string | null;
}

const toCashItem = (row: CashRow): CashBookItem => ({
  entryId: row.entry_id,
  effectiveOn: row.effective_on,
  reference: row.reference,
  kind: journalKindSchema.parse(row.kind),
  memo: row.memo,
  link:
    row.payment_id === null ? null : { type: 'payment', id: row.payment_id },
  inMinor: Number(row.in_minor),
  outMinor: Number(row.out_minor),
  runningBalanceMinor: Number(row.running_minor),
});

const moneyAccountValues = (change: MoneyAccountChange) => ({
  ...(change.name === undefined ? {} : { name: change.name }),
  ...(change.bankName === undefined ? {} : { bank_name: change.bankName }),
  ...(change.last4 === undefined ? {} : { account_last4: change.last4 }),
  ...(change.retire === true
    ? { retired_at: sql<Date>`COALESCE(retired_at, now())` }
    : {}),
});

@Injectable()
export class KyselyMoneyAccountRepository extends MoneyAccountRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private accounts(db: Database, organizationId: string) {
    return db
      .selectFrom('money_account')
      .innerJoin('ledger_account', (join) =>
        join
          .onRef('ledger_account.id', '=', 'money_account.ledger_account_id')
          .onRef(
            'ledger_account.organization_id',
            '=',
            'money_account.organization_id'
          )
      )
      .leftJoin('team', 'team.id', 'money_account.campus_id')
      .where('money_account.organization_id', '=', organizationId)
      .select([
        'money_account.id',
        'money_account.name',
        'money_account.kind',
        'money_account.campus_id',
        'money_account.bank_name',
        'money_account.account_last4',
        'money_account.ledger_account_id',
        'money_account.retired_at',
        'ledger_account.code as ledger_code',
        'team.name as campus_name',
        sql<string>`(
          SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0)
          FROM journal_line jl
          WHERE jl.ledger_account_id = money_account.ledger_account_id
            AND jl.organization_id = money_account.organization_id
        )`.as('balance'),
      ]);
  }

  private visible(db: Database, scope: MoneyAccountScope) {
    return this.accounts(db, scope.organizationId).where((eb) =>
      inCampusScope(eb, 'money_account.campus_id', {
        scope: scope.campusScope,
      })
    );
  }

  private async hiddenSchoolWide(scope: MoneyAccountScope): Promise<number> {
    if (scope.campusScope === 'all') {
      return 0;
    }
    const row = await this.db
      .selectFrom('money_account')
      .select(sql<string>`count(*)`.as('count'))
      .where('organization_id', '=', scope.organizationId)
      .where('campus_id', 'is', null)
      .where('retired_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async list(scope: MoneyAccountScope): Promise<MoneyAccountList> {
    const [rows, hiddenSchoolWideCount, currency] = await Promise.all([
      this.visible(this.db, scope)
        .orderBy(sql`money_account.retired_at IS NOT NULL`)
        .orderBy('ledger_account.code')
        .execute(),
      this.hiddenSchoolWide(scope),
      schoolCurrency(this.db, scope.organizationId),
    ]);
    return {
      currency,
      items: rows.map((row) => toAccount(row)),
      hiddenSchoolWideCount,
    };
  }

  async findById(
    scope: MoneyAccountScope,
    id: string
  ): Promise<MoneyAccount | undefined> {
    const row = await this.visible(this.db, scope)
      .where('money_account.id', '=', id)
      .executeTakeFirst();
    return row === undefined ? undefined : toAccount(row);
  }

  async cashBook(
    scope: MoneyAccountScope,
    account: MoneyAccount,
    paging: { page: number; pageSize: number }
  ): Promise<{ items: CashBookItem[]; total: number; currency: string }> {
    const { organizationId } = scope;
    const ledgerAccountId = account.ledgerAccountId;
    const offset = (paging.page - 1) * paging.pageSize;
    const [page, count, currency] = await Promise.all([
      sql<CashRow>`
        WITH moves AS (
          SELECT e.id AS entry_id, e.reference, e.kind, e.memo, e.sequence,
            e.effective_on AS sort_day,
            to_char(e.effective_on, 'YYYY-MM-DD') AS effective_on,
            (
              SELECT p.id FROM payment p
              WHERE p.journal_entry_id = e.id AND p.organization_id = e.organization_id
            ) AS payment_id,
            SUM(l.debit_minor) AS in_minor,
            SUM(l.credit_minor) AS out_minor
          FROM journal_line l
          JOIN journal_entry e
            ON e.id = l.entry_id AND e.organization_id = l.organization_id
          WHERE l.organization_id = ${organizationId}
            AND l.ledger_account_id = ${ledgerAccountId}
          GROUP BY e.id
        ), running AS (
          SELECT moves.*,
            SUM(in_minor - out_minor) OVER (ORDER BY sort_day, sequence) AS running_minor
          FROM moves
        )
        SELECT entry_id, reference, kind, memo, effective_on,
          in_minor, out_minor, running_minor, payment_id
        FROM running
        ORDER BY sort_day DESC, sequence DESC
        LIMIT ${paging.pageSize} OFFSET ${offset}`.execute(this.db),
      this.db
        .selectFrom('journal_line')
        .select(sql<string>`count(DISTINCT entry_id)`.as('count'))
        .where('organization_id', '=', organizationId)
        .where('ledger_account_id', '=', ledgerAccountId)
        .executeTakeFirstOrThrow(),
      schoolCurrency(this.db, organizationId),
    ]);
    return {
      items: page.rows.map((row) => toCashItem(row)),
      total: Number(count.count),
      currency,
    };
  }

  create(input: NewMoneyAccount): Promise<MoneyAccountOutcome> {
    return transactAccounts(this.db, (trx) => this.createIn(trx, input));
  }

  private async createIn(
    trx: Database,
    input: NewMoneyAccount
  ): Promise<MoneyAccountOutcome> {
    const { organizationId } = input;
    const parent = await trx
      .selectFrom('ledger_account')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('system_key', '=', MONEY_ACCOUNTS_SYSTEM_KEY)
      .executeTakeFirstOrThrow();
    const ledger = await insertChildAccount(trx, {
      organizationId,
      parentId: parent.id,
      name: input.name,
    });
    if (ledger.status === 'name_taken') {
      return ledger;
    }
    const created = await trx
      .insertInto('money_account')
      .values({
        organization_id: organizationId,
        ledger_account_id: ledger.row.id,
        campus_id: input.campusId,
        name: input.name,
        kind: input.kind,
        bank_name: input.bankName,
        account_last4: input.last4,
        created_by: input.userId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const row = await this.accounts(trx, organizationId)
      .where('money_account.id', '=', created.id)
      .executeTakeFirstOrThrow();
    return { status: 'saved', account: toAccount(row) };
  }

  update(
    scope: MoneyAccountScope,
    id: string,
    change: MoneyAccountChange
  ): Promise<MoneyAccountOutcome | undefined> {
    return transactAccounts(this.db, (trx) =>
      this.updateIn(trx, { scope, id, change })
    );
  }

  private async updateIn(
    trx: Database,
    target: { scope: MoneyAccountScope; id: string; change: MoneyAccountChange }
  ): Promise<MoneyAccountOutcome | undefined> {
    const { scope, id, change } = target;
    const current = await this.visible(trx, scope)
      .where('money_account.id', '=', id)
      .executeTakeFirst();
    if (current === undefined) {
      return undefined;
    }
    if (change.name !== undefined) {
      await trx
        .updateTable('ledger_account')
        .set({ name: change.name })
        .where('organization_id', '=', scope.organizationId)
        .where('id', '=', current.ledger_account_id)
        .execute();
    }
    const values = moneyAccountValues(change);
    if (Object.keys(values).length > 0) {
      await trx
        .updateTable('money_account')
        .set(values)
        .where('organization_id', '=', scope.organizationId)
        .where('id', '=', id)
        .execute();
    }
    const row = await this.accounts(trx, scope.organizationId)
      .where('money_account.id', '=', id)
      .executeTakeFirstOrThrow();
    return { status: 'saved', account: toAccount(row) };
  }

  async recordingOptions(scope: MoneyAccountScope): Promise<RecordingOption[]> {
    const rows = await this.accounts(this.db, scope.organizationId)
      .where('money_account.kind', '<>', 'gateway')
      .where('money_account.retired_at', 'is', null)
      .where((eb) =>
        inCampusScope(eb, 'money_account.campus_id', {
          scope: scope.campusScope,
          nullMeans: 'all',
        })
      )
      .orderBy('ledger_account.code')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      label:
        row.account_last4 === null
          ? row.name
          : `${row.name} · ending ${row.account_last4}`,
      kind: moneyAccountKindSchema.parse(row.kind),
    }));
  }
}
