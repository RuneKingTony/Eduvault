import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  STORE_COST_SYSTEM_KEY,
  STORE_SALES_SYSTEM_KEY,
  STORE_STOCK_SYSTEM_KEY,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { advisoryLock } from '../../common/db/advisory-lock';
import { uniqueViolation } from '../../common/db/unique-violation';
import {
  allocateDocumentNumber,
  formatDocumentNumber,
} from '../../common/documents';
import {
  systemAccountId,
  type LedgerPoster,
  type PostInput,
} from '../../common/ledger';
import { paymentRequestHash, writePayment } from '../../common/payments';
import { findSaleStudent } from './kysely-sale-read.repository';
import { lockStock } from './kysely-stock-lock.repository';
import { priceSale, type PricedLine } from './sale-pricing';
import {
  saleChargePosting,
  saleCostPosting,
  saleLineDescription,
} from './sale-posting';
import type { ExistingSale, NewSale, SaleOutcome } from './sale.repository';

const PROOF_FILE_KEY = 'payment_proof_file_key';

/** Thrown inside the transaction so everything posted so far rolls back. */
class SaleAbort extends Error {
  constructor(readonly outcome: SaleOutcome) {
    super(outcome.status);
    this.name = 'SaleAbort';
  }
}

interface SaleRun {
  input: NewSale;
  lines: PricedLine[];
  totalMinor: number;
  costMinor: number;
  saleId: string;
  invoiceId: string;
  saleNumber: string;
  chargeNumber: string;
}

export async function findSaleByReference(
  db: Kysely<DB>,
  organizationId: string,
  reference: string
): Promise<ExistingSale | undefined> {
  const row = await db
    .selectFrom('store_sale')
    .innerJoin('payment', (join) =>
      join
        .onRef('payment.id', '=', 'store_sale.payment_id')
        .onRef('payment.organization_id', '=', 'store_sale.organization_id')
    )
    .select([
      'store_sale.id',
      'store_sale.number',
      'store_sale.request_hash',
      'payment.money_account_id',
    ])
    .where('store_sale.organization_id', '=', organizationId)
    .where('store_sale.reference', '=', reference)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      number: row.number,
      requestHash: row.request_hash,
      moneyAccountId: row.money_account_id,
    }
  );
}

async function postOnce(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  posting: PostInput
): Promise<string> {
  const { entry, replayed } = await poster.post(trx, posting);
  if (replayed) {
    throw new SaleAbort({ status: 'posting_clash' });
  }
  return entry.id;
}

async function insertDraftCharge(
  trx: Kysely<DB>,
  run: SaleRun,
  salesAccountId: string
): Promise<void> {
  const { input, invoiceId } = run;
  await trx
    .insertInto('invoice')
    .values({
      id: invoiceId,
      organization_id: input.organizationId,
      student_id: input.student.id,
      term_id: input.termId,
      campus_id: input.store.campusId,
      kind: 'store',
      status: 'draft',
      created_by: input.userId,
    })
    .execute();
  await trx
    .insertInto('invoice_line')
    .values(
      run.lines.map((line) => ({
        organization_id: input.organizationId,
        invoice_id: invoiceId,
        ledger_account_id: salesAccountId,
        description: saleLineDescription(line.displayName, line.quantity),
        amount_minor: String(line.amountMinor),
      }))
    )
    .execute();
}

async function issueCharge(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  run: SaleRun
): Promise<void> {
  const { input } = run;
  const { organizationId } = input;
  const [receivableId, salesAccountId] = await Promise.all([
    systemAccountId(trx, organizationId, FEES_RECEIVABLE_SYSTEM_KEY),
    systemAccountId(trx, organizationId, STORE_SALES_SYSTEM_KEY),
  ]);
  await insertDraftCharge(trx, run, salesAccountId);
  const entryId = await postOnce(
    trx,
    poster,
    saleChargePosting({
      organizationId,
      invoiceId: run.invoiceId,
      chargeNumber: run.chargeNumber,
      effectiveOn: input.today,
      postedBy: input.userId,
      campusId: input.store.campusId,
      studentId: input.student.id,
      studentName: input.student.name,
      receivableId,
      salesAccountId,
      lines: run.lines,
    })
  );
  await trx
    .updateTable('invoice')
    .set({
      status: 'issued',
      number: run.chargeNumber,
      issued_at: sql<Date>`now()`,
      issued_by: input.userId,
      journal_entry_id: entryId,
    })
    .where('id', '=', run.invoiceId)
    .where('organization_id', '=', organizationId)
    .where('status', '=', 'draft')
    .execute();
}

async function postCost(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  run: SaleRun
): Promise<void> {
  const { input } = run;
  const { organizationId } = input;
  const posting = saleCostPosting({
    organizationId,
    invoiceId: run.invoiceId,
    chargeNumber: run.chargeNumber,
    effectiveOn: input.today,
    postedBy: input.userId,
    campusId: input.store.campusId,
    costMinor: run.costMinor,
    costExpenseId: await systemAccountId(
      trx,
      organizationId,
      STORE_COST_SYSTEM_KEY
    ),
    storeStockId: await systemAccountId(
      trx,
      organizationId,
      STORE_STOCK_SYSTEM_KEY
    ),
  });
  if (posting !== undefined) {
    await postOnce(trx, poster, posting);
  }
}

async function takePayment(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  run: SaleRun
): Promise<string> {
  const { input } = run;
  const { student, account } = input;
  const allocations = [{ studentId: student.id, amountMinor: run.totalMinor }];
  const payer = student.payer ?? {
    guardianId: null,
    name: `Family of ${student.name}`,
  };
  const outcome = await writePayment(trx, poster, {
    organizationId: input.organizationId,
    userId: input.userId,
    year: input.year,
    reference: input.reference,
    requestHash: paymentRequestHash({
      payerGuardianId: payer.guardianId ?? undefined,
      payerName: payer.name,
      moneyAccountId: account.id,
      method: input.method,
      providerReference: undefined,
      amountMinor: run.totalMinor,
      paidOn: input.today,
      allocations,
    }),
    payerGuardianId: payer.guardianId,
    payerName: payer.name,
    moneyAccountId: account.id,
    ledgerAccountId: account.ledgerAccountId,
    accountCampusId: account.campusId,
    method: input.method,
    providerReference: null,
    proofFileId: input.proofFileId,
    amountMinor: run.totalMinor,
    paidOn: input.today,
    allocations,
  });
  if (outcome.status !== 'recorded') {
    throw new SaleAbort({ status: 'posting_clash' });
  }
  return outcome.id;
}

async function insertRows(
  trx: Kysely<DB>,
  run: SaleRun,
  paymentId: string
): Promise<void> {
  const { input } = run;
  const { organizationId } = input;
  await trx
    .insertInto('stock_movement')
    .values(
      run.lines.map((line) => ({
        organization_id: organizationId,
        store_id: input.store.id,
        item_id: line.itemId,
        quantity: -line.quantity,
        kind: 'sell',
        value_minor: -line.costMinor,
        reference: input.reference,
        source_id: run.saleId,
        moved_by: input.userId,
      }))
    )
    .execute();
  await trx
    .insertInto('store_sale')
    .values({
      id: run.saleId,
      organization_id: organizationId,
      number: run.saleNumber,
      reference: input.reference,
      request_hash: input.requestHash,
      store_id: input.store.id,
      student_id: input.student.id,
      invoice_id: run.invoiceId,
      payment_id: paymentId,
      sold_by: input.userId,
      sold_on: input.today,
    })
    .execute();
  await trx
    .insertInto('store_sale_line')
    .values(
      run.lines.map((line) => ({
        organization_id: organizationId,
        store_sale_id: run.saleId,
        item_id: line.itemId,
        quantity: line.quantity,
        unit_price_minor: line.unitPriceMinor,
        cost_minor: line.costMinor,
      }))
    )
    .execute();
}

async function numbersFor(
  trx: Kysely<DB>,
  input: NewSale
): Promise<Pick<SaleRun, 'saleNumber' | 'chargeNumber'>> {
  const { organizationId, year } = input;
  const issued = await allocateDocumentNumber(trx, {
    organizationId,
    kind: 'store_sale',
    year,
  });
  const charged = await allocateDocumentNumber(trx, {
    organizationId,
    kind: 'invoice',
    year,
  });
  return {
    saleNumber: formatDocumentNumber('store_sale', year, issued),
    chargeNumber: formatDocumentNumber('invoice', year, charged),
  };
}

async function stillSellable(
  trx: Kysely<DB>,
  input: NewSale
): Promise<SaleOutcome | undefined> {
  const { organizationId } = input;
  const student = await findSaleStudent(
    trx,
    { organizationId, campusScope: 'all' },
    { studentId: input.student.id, today: input.today }
  );
  if (student?.life !== 'active') {
    return { status: 'student_not_active' };
  }
  const term = await trx
    .selectFrom('term')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('is_current', '=', true)
    .executeTakeFirst();
  return term?.id === input.termId ? undefined : { status: 'no_term' };
}

async function recordIn(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  input: NewSale
): Promise<SaleOutcome> {
  const { organizationId, reference } = input;
  await advisoryLock(trx, `store-sale:${organizationId}:${reference}`);
  const existing = await findSaleByReference(trx, organizationId, reference);
  if (existing !== undefined) {
    return existing.requestHash === input.requestHash
      ? { status: 'replayed', id: existing.id }
      : { status: 'reference_used', number: existing.number };
  }
  const unsellable = await stillSellable(trx, input);
  if (unsellable !== undefined) {
    return unsellable;
  }
  const stock = await lockStock(trx, {
    organizationId,
    storeId: input.store.id,
    itemIds: input.lines.map((line) => line.itemId),
  });
  const pricing = priceSale(input.lines, stock);
  if (pricing.status === 'short') {
    return {
      status: 'stock_short',
      itemName: pricing.itemName,
      onHand: pricing.onHand,
    };
  }
  const run: SaleRun = {
    input,
    lines: pricing.lines,
    totalMinor: pricing.totalMinor,
    costMinor: pricing.costMinor,
    saleId: randomUUID(),
    invoiceId: randomUUID(),
    ...(await numbersFor(trx, input)),
  };
  await issueCharge(trx, poster, run);
  await postCost(trx, poster, run);
  await insertRows(trx, run, await takePayment(trx, poster, run));
  return { status: 'recorded', id: run.saleId };
}

export async function insertSale(
  db: Kysely<DB>,
  poster: LedgerPoster,
  input: NewSale
): Promise<SaleOutcome> {
  try {
    return await db
      .transaction()
      .execute((trx) => recordIn(trx, poster, input));
  } catch (error) {
    if (error instanceof SaleAbort) {
      return error.outcome;
    }
    if (uniqueViolation(error) === PROOF_FILE_KEY) {
      return { status: 'proof_taken' };
    }
    throw error;
  }
}
