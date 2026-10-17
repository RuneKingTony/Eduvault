import type {
  Item,
  RecordedDelivery,
  RecordedSale,
} from '@eduvault/api-contract';
import type { Pool } from 'pg';
import type { Fixtures, TestUser } from '../base-test';

type Api = Fixtures['api'];

let sequence = 0;

export const nextDeliveryReference = (): string => {
  sequence += 1;
  return `DEL-REQ-20261007-${String(sequence).padStart(8, '0')}`;
};

let saleSequence = 0;

const nextSaleReference = (): string => {
  saleSequence += 1;
  return `STORE-20261007-${String(saleSequence).padStart(8, '0')}`;
};

export const shirt = (overrides: Record<string, unknown> = {}) => ({
  kind: 'uniform',
  name: 'School shirt',
  variant: 'Size 12',
  costPriceMinor: 350_000,
  sellPriceMinor: 450_000,
  ...overrides,
});

export async function createItem(
  api: Api,
  actor: TestUser,
  overrides: Record<string, unknown> = {}
): Promise<Item> {
  const res = await api(actor)
    .post('/store/items')
    .send(shirt(overrides))
    .expect(201);
  return res.body as Item;
}

export async function classLevelId(
  pool: Pool,
  organizationId: string,
  code = 'JSS1'
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM class_level WHERE organization_id = $1 AND code = $2',
    [organizationId, code]
  );
  const [row] = rows;
  if (row === undefined) {
    throw new Error(`No class level ${code}`);
  }
  return row.id;
}

interface DeliveryInput {
  campusId: string;
  accountId?: string;
  lines: { itemId: string; quantity: number; unitCostMinor: number }[];
  reference?: string;
  supplierName?: string;
  receivedOn?: string;
}

export const deliveryBody = (input: DeliveryInput) => ({
  reference: input.reference ?? nextDeliveryReference(),
  campusId: input.campusId,
  supplierName: input.supplierName ?? 'Adebayo Uniforms Ltd',
  ...(input.accountId === undefined ? {} : { moneyAccountId: input.accountId }),
  ...(input.receivedOn === undefined ? {} : { receivedOn: input.receivedOn }),
  lines: input.lines,
});

export async function receive(
  api: Api,
  actor: TestUser,
  input: DeliveryInput
): Promise<RecordedDelivery> {
  const res = await api(actor)
    .post('/store/deliveries')
    .send(deliveryBody(input))
    .expect(201);
  return res.body as RecordedDelivery;
}

export async function openStock(
  api: Api,
  actor: TestUser,
  input: Omit<DeliveryInput, 'accountId'>
): Promise<RecordedDelivery> {
  const res = await api(actor)
    .post('/store/deliveries')
    .send({
      ...deliveryBody({ supplierName: 'Opening stock count', ...input }),
      isOpening: true,
    })
    .expect(201);
  return res.body as RecordedDelivery;
}

export async function gatewayAccountId(
  pool: Pool,
  organizationId: string
): Promise<string> {
  const ledger = await pool.query<{ id: string }>(
    `INSERT INTO ledger_account (organization_id, code, name, type, parent_id)
     VALUES ($1, 1290, 'Paystack', 'asset',
       (SELECT id FROM ledger_account WHERE organization_id = $1 AND code = 1200))
     RETURNING id`,
    [organizationId]
  );
  const account = await pool.query<{ id: string }>(
    `INSERT INTO money_account (organization_id, ledger_account_id, name, kind)
     VALUES ($1, $2, 'Paystack', 'gateway') RETURNING id`,
    [organizationId, ledger.rows[0]?.id]
  );
  const [row] = account.rows;
  if (row === undefined) {
    throw new Error('The gateway account was not created');
  }
  return row.id;
}

export async function storeIdOf(pool: Pool, campusId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM store WHERE campus_id = $1',
    [campusId]
  );
  const [row] = rows;
  if (row === undefined) {
    throw new Error(`No store for campus ${campusId}`);
  }
  return row.id;
}

export async function stockLedgerByCampus(
  pool: Pool,
  organizationId: string
): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ campus_id: string; total: string }>(
    `SELECT jl.campus_id, sum(jl.debit_minor - jl.credit_minor)::text AS total
     FROM journal_line jl
     JOIN ledger_account la ON la.id = jl.ledger_account_id
     WHERE jl.organization_id = $1 AND la.code = 1300
     GROUP BY jl.campus_id`,
    [organizationId]
  );
  return Object.fromEntries(
    rows.map((row) => [row.campus_id, Number(row.total)])
  );
}

export async function stockValueByCampus(
  pool: Pool,
  organizationId: string
): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ campus_id: string; total: string }>(
    `SELECT s.campus_id, sum(m.value_minor)::text AS total
     FROM stock_movement m JOIN store s ON s.id = m.store_id
     WHERE m.organization_id = $1
     GROUP BY s.campus_id`,
    [organizationId]
  );
  return Object.fromEntries(
    rows.map((row) => [row.campus_id, Number(row.total)])
  );
}

interface SaleInput {
  studentId: string;
  lines: { itemId: string; quantity: number }[];
  method?: 'cash' | 'pos' | 'transfer';
  accountId?: string;
  proofFileId?: string;
  reference?: string;
}

export const saleBody = (input: SaleInput) => ({
  reference: input.reference ?? nextSaleReference(),
  studentId: input.studentId,
  method: input.method ?? 'cash',
  ...(input.accountId === undefined ? {} : { moneyAccountId: input.accountId }),
  ...(input.proofFileId === undefined
    ? {}
    : { proofFileId: input.proofFileId }),
  lines: input.lines,
});

export async function sell(
  api: Api,
  actor: TestUser,
  input: SaleInput
): Promise<RecordedSale> {
  const res = await api(actor)
    .post('/store/sales')
    .send(saleBody(input))
    .expect(201);
  return res.body as RecordedSale;
}

const SALE_TABLES = [
  'store_sale',
  'store_sale_line',
  'stock_movement',
  'payment',
  'payment_allocation',
  'invoice',
  'journal_entry',
] as const;

export async function saleTables(
  pool: Pool
): Promise<Record<(typeof SALE_TABLES)[number], number>> {
  const counts = await Promise.all(
    SALE_TABLES.map(async (table) => {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${table}`
      );
      return [table, Number(rows[0]?.n)] as const;
    })
  );
  return Object.fromEntries(counts) as Record<
    (typeof SALE_TABLES)[number],
    number
  >;
}
