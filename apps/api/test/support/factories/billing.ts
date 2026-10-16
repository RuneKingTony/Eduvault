import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type {
  BillingRun,
  Invoice,
  InvoiceList,
  PrepareBody,
  PrepareResult,
} from '@eduvault/api-contract';
import { sql } from 'kysely';
import type { Pool } from 'pg';
import { KYSELY_TOKEN, type Database } from '../../../src/app/common/db/tokens';
import { LedgerPoster, type PostInput } from '../../../src/app/common/ledger';
import type { Fixtures, TestUser } from '../base-test';
import { createFeeLine, feeFixture } from './fees';
import { termOf } from './terms';

type Api = Fixtures['api'];
type Actor = TestUser;

export const TUITION_MINOR = 18_000_000;
export const BUS_MINOR = 4_000_000;

interface ChargeFixture {
  firstTermId: string;
  secondTermId: string;
  thirdTermId: string;
  sessionId: string;
}

export async function chargeFixture(
  app: INestApplication,
  api: Api,
  owner: Actor
): Promise<ChargeFixture> {
  const fixture = await feeFixture(app, api, owner);
  const year = { year: '2026/2027' };
  const [second, third] = await Promise.all([
    termOf(api, owner, { ...year, sequence: 2 }),
    termOf(api, owner, { ...year, sequence: 3 }),
  ]);
  const as = { app, actor: owner };
  const jss1 = { level: 'JSS1' };
  await createFeeLine(as, fixture, {
    ...jss1,
    name: 'JSS 1 Tuition',
    amountMinor: TUITION_MINOR,
  });
  await createFeeLine(
    as,
    { ...fixture, termId: second.id },
    {
      ...jss1,
      name: 'JSS 1 Tuition',
      amountMinor: TUITION_MINOR,
    }
  );
  await createFeeLine(
    as,
    { ...fixture, termId: second.id },
    {
      ...jss1,
      feeType: 'School bus',
      name: 'School bus',
      amountMinor: BUS_MINOR,
    }
  );
  return {
    firstTermId: fixture.termId,
    secondTermId: second.id,
    thirdTermId: third.id,
    sessionId: fixture.sessionId,
  };
}

export const prepare = async (
  api: Api,
  actor: Actor,
  body: PrepareBody
): Promise<PrepareResult> =>
  (await api(actor).post('/billing-runs').send(body).expect(201))
    .body as PrepareResult;

export const sendRun = async (
  api: Api,
  actor: Actor,
  runId: string
): Promise<BillingRun> =>
  (await api(actor).post(`/billing-runs/${runId}/issue`).expect(201))
    .body as BillingRun;

export const runOf = async (
  api: Api,
  actor: Actor,
  runId: string
): Promise<BillingRun> =>
  (await api(actor).get(`/billing-runs/${runId}`).expect(200))
    .body as BillingRun;

export const invoicesOf = async (
  api: Api,
  actor: Actor,
  query = ''
): Promise<InvoiceList> =>
  (await api(actor).get(`/invoices${query}`).expect(200)).body as InvoiceList;

export const invoiceOf = async (
  api: Api,
  actor: Actor,
  id: string
): Promise<Invoice> =>
  (await api(actor).get(`/invoices/${id}`).expect(200)).body as Invoice;

interface DiscountSeed {
  organizationId: string;
  studentId: string;
  fromTermId: string;
  toTermId?: string | null;
  kind?: 'percent' | 'fixed';
  value?: number;
  feeTypeId?: string | null;
  reason?: string;
  status?: 'submitted' | 'approved';
  approvedAt?: string;
}

const approvedAtFor = (status: string, approvedAt: string) =>
  status === 'approved' ? approvedAt : null;

export async function addDiscount(
  pool: Pool,
  {
    organizationId,
    studentId,
    fromTermId,
    toTermId = null,
    kind = 'percent',
    value = 5,
    feeTypeId = null,
    reason = 'Sibling discount (3 children)',
    status = 'approved',
    approvedAt = new Date().toISOString(),
  }: DiscountSeed
): Promise<string> {
  const id = randomUUID();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM "user" LIMIT 1`
  );
  await pool.query(
    `INSERT INTO student_discount
       (id, organization_id, student_id, kind, value, ledger_account_id, reason,
        from_term_id, to_term_id, status, created_by, approved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      organizationId,
      studentId,
      kind,
      value,
      feeTypeId,
      reason,
      fromTermId,
      toTermId,
      status,
      rows[0]?.id ?? null,
      approvedAtFor(status, approvedAt),
    ]
  );
  return id;
}

export async function entriesFor(
  pool: Pool,
  organizationId: string,
  reference: string
): Promise<
  {
    code: number;
    student_id: string | null;
    campus_id: string | null;
    debit_minor: string;
    credit_minor: string;
  }[]
> {
  const { rows } = await pool.query(
    `SELECT la.code, jl.student_id, jl.campus_id, jl.debit_minor::text, jl.credit_minor::text
     FROM journal_entry je
     JOIN journal_line jl ON jl.entry_id = je.id
     JOIN ledger_account la ON la.id = jl.ledger_account_id
     WHERE je.organization_id = $1 AND je.reference = $2
     ORDER BY la.code, jl.debit_minor DESC`,
    [organizationId, reference]
  );
  return rows;
}

export async function receivableBalance(
  pool: Pool,
  organizationId: string,
  studentId: string
): Promise<number> {
  const { rows } = await pool.query<{ balance: string }>(
    `SELECT COALESCE(sum(jl.debit_minor - jl.credit_minor), 0)::text AS balance
     FROM journal_line jl
     JOIN ledger_account la ON la.id = jl.ledger_account_id
     WHERE jl.organization_id = $1 AND jl.student_id = $2 AND la.system_key = 'fees_receivable'`,
    [organizationId, studentId]
  );
  return Number(rows[0]?.balance ?? 0);
}

interface StoreChargeInOneTransaction {
  organizationId: string;
  studentId: string;
  termId: string;
  campusId: string;
  number: string;
  lineAccountId: string;
  lineMinor: number;
  before: PostInput;
  charge: PostInput;
  after: PostInput;
}

export async function issueStoreChargeBetween(
  app: INestApplication,
  input: StoreChargeInOneTransaction
): Promise<string> {
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const poster = app.get(LedgerPoster, { strict: false });
  return db.transaction().execute(async (trx) => {
    const draft = await trx
      .insertInto('invoice')
      .values({
        organization_id: input.organizationId,
        student_id: input.studentId,
        term_id: input.termId,
        campus_id: input.campusId,
        kind: 'store',
        status: 'draft',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('invoice_line')
      .values({
        organization_id: input.organizationId,
        invoice_id: draft.id,
        ledger_account_id: input.lineAccountId,
        description: 'Store charge',
        amount_minor: String(input.lineMinor),
      })
      .execute();
    await poster.post(trx, input.before);
    const { entry } = await poster.post(trx, input.charge);
    await poster.post(trx, input.after);
    await trx
      .updateTable('invoice')
      .set({
        status: 'issued',
        number: input.number,
        issued_at: sql<Date>`now()`,
        journal_entry_id: entry.id,
      })
      .where('id', '=', draft.id)
      .execute();
    return draft.id;
  });
}

export async function firstIdIn(
  pool: Pool,
  table: 'term' | 'class_level',
  organizationId: string
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE organization_id = $1 LIMIT 1`,
    [organizationId]
  );
  return rows[0]?.id ?? '';
}
