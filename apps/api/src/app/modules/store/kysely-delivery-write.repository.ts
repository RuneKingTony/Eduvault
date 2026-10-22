import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import {
  OPENING_BALANCE_SYSTEM_KEY,
  STORE_STOCK_SYSTEM_KEY,
} from '@eduvault/api-contract';
import { SYSTEM_REFERENCE_PREFIXES } from '@eduvault/shared';
import type { DB } from '../../../db/db-types';
import type { ActivityWriter } from '../../common/activity';
import { advisoryLock } from '../../common/db/advisory-lock';
import { claimReference } from '../../common/references/apply-once';
import { uniqueViolation } from '../../common/db/unique-violation';
import {
  allocateDocumentNumber,
  formatDocumentNumber,
} from '../../common/documents';
import { systemAccountId, type LedgerPoster } from '../../common/ledger';
import { receiveValue } from './stock-value';
import type {
  DeliveryActivity,
  DeliveryOutcome,
  ExistingDelivery,
  NewDelivery,
} from './store.repository';
import { deliveryPosting, openingStockPosting } from './store-posting';

const OPENING_KEY = 'stock_delivery_opening_key';

interface Issued {
  number: string;
  deliveryId: string;
  totalMinor: number;
}

interface DeliveryDeps {
  poster: LedgerPoster;
  activity: ActivityWriter;
  record: DeliveryActivity;
}

export async function findDeliveryByReference(
  db: Kysely<DB>,
  organizationId: string,
  reference: string
): Promise<ExistingDelivery | undefined> {
  const row = await db
    .selectFrom('stock_delivery')
    .select(['id', 'number', 'request_hash'])
    .where('organization_id', '=', organizationId)
    .where('reference', '=', reference)
    .executeTakeFirst();
  return (
    row && { id: row.id, number: row.number, requestHash: row.request_hash }
  );
}

export async function hasOpeningStock(
  db: Kysely<DB>,
  organizationId: string,
  storeId: string
): Promise<boolean> {
  const row = await db
    .selectFrom('stock_delivery')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('store_id', '=', storeId)
    .where('is_opening', '=', true)
    .executeTakeFirst();
  return row !== undefined;
}

async function numberFor(trx: Kysely<DB>, input: NewDelivery): Promise<string> {
  if (input.isOpening) {
    return `${SYSTEM_REFERENCE_PREFIXES.opening}-STORE-${input.store.campusId}`;
  }
  const value = await allocateDocumentNumber(trx, {
    organizationId: input.organizationId,
    kind: 'delivery',
    year: input.year,
  });
  return formatDocumentNumber('delivery', input.year, value);
}

async function postEntry(
  trx: Kysely<DB>,
  poster: LedgerPoster,
  delivery: { input: NewDelivery; issued: Issued }
): Promise<string> {
  const { input, issued } = delivery;
  const { organizationId } = input;
  const shared = {
    organizationId,
    number: issued.number,
    deliveryId: issued.deliveryId,
    campusId: input.store.campusId,
    receivedOn: input.receivedOn,
    postedBy: input.userId,
    totalMinor: issued.totalMinor,
    storeStockId: await systemAccountId(
      trx,
      organizationId,
      STORE_STOCK_SYSTEM_KEY
    ),
  };
  const posting =
    input.moneyAccount === null
      ? openingStockPosting({
          ...shared,
          storeName: input.store.name,
          openingBalanceId: await systemAccountId(
            trx,
            organizationId,
            OPENING_BALANCE_SYSTEM_KEY
          ),
        })
      : deliveryPosting({
          ...shared,
          supplierName: input.supplierName,
          moneyLedgerAccountId: input.moneyAccount.ledgerAccountId,
        });
  const entry = await poster.postOnce(trx, posting);
  return entry.id;
}

async function insertRows(
  trx: Kysely<DB>,
  delivery: { input: NewDelivery; issued: Issued; entryId: string }
): Promise<void> {
  const { input, issued, entryId } = delivery;
  const { organizationId } = input;
  await trx
    .insertInto('stock_delivery')
    .values({
      id: issued.deliveryId,
      organization_id: organizationId,
      number: issued.number,
      reference: input.reference,
      request_hash: input.requestHash,
      store_id: input.store.id,
      supplier_name: input.supplierName,
      money_account_id: input.moneyAccount?.id ?? null,
      is_opening: input.isOpening,
      received_on: input.receivedOn,
      received_by: input.userId,
      total_minor: issued.totalMinor,
      journal_entry_id: entryId,
    })
    .execute();
  await trx
    .insertInto('stock_delivery_line')
    .values(
      input.lines.map((line) => ({
        organization_id: organizationId,
        stock_delivery_id: issued.deliveryId,
        item_id: line.itemId,
        quantity: line.quantity,
        unit_cost_minor: line.unitCostMinor,
      }))
    )
    .execute();
  await trx
    .insertInto('stock_movement')
    .values(
      input.lines.map((line) => ({
        organization_id: organizationId,
        store_id: input.store.id,
        item_id: line.itemId,
        quantity: line.quantity,
        kind: input.isOpening ? 'opening' : 'receive',
        value_minor: receiveValue(line.quantity, line.unitCostMinor),
        reference: issued.number,
        source_id: issued.deliveryId,
        moved_by: input.userId,
      }))
    )
    .execute();
}

async function create(
  trx: Kysely<DB>,
  deps: DeliveryDeps,
  input: NewDelivery
): Promise<DeliveryOutcome> {
  const issued: Issued = {
    number: await numberFor(trx, input),
    deliveryId: randomUUID(),
    totalMinor: input.lines.reduce(
      (sum, line) => sum + receiveValue(line.quantity, line.unitCostMinor),
      0
    ),
  };
  const entryId = await postEntry(trx, deps.poster, { input, issued });
  await insertRows(trx, { input, issued, entryId });
  await deps.activity.within(trx).recordMany(
    deps.record({
      id: issued.deliveryId,
      number: issued.number,
      totalMinor: issued.totalMinor,
    })
  );
  return { status: 'recorded', id: issued.deliveryId };
}

async function recordIn(
  trx: Kysely<DB>,
  deps: DeliveryDeps,
  input: NewDelivery
): Promise<DeliveryOutcome> {
  const { organizationId, reference } = input;
  const claim = await claimReference(trx, {
    lockKey: `delivery:${organizationId}:${reference}`,
    requestHash: input.requestHash,
    find: () => findDeliveryByReference(trx, organizationId, reference),
  });
  if (claim.status === 'replayed') {
    return { status: 'replayed', id: claim.existing.id };
  }
  if (claim.status === 'clash') {
    return { status: 'reference_used', number: claim.existing.number };
  }
  if (input.isOpening) {
    await advisoryLock(
      trx,
      `delivery-opening:${organizationId}:${input.store.id}`
    );
    if (await hasOpeningStock(trx, organizationId, input.store.id)) {
      return { status: 'opening_exists' };
    }
  }
  return create(trx, deps, input);
}

export async function insertDelivery(
  db: Kysely<DB>,
  deps: DeliveryDeps,
  input: NewDelivery
): Promise<DeliveryOutcome> {
  try {
    return await db.transaction().execute((trx) => recordIn(trx, deps, input));
  } catch (error) {
    if (uniqueViolation(error) === OPENING_KEY) {
      return { status: 'opening_exists' };
    }
    throw error;
  }
}
