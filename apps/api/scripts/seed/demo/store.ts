import {
  OPENING_STOCK_SUPPLIER,
  storeSaleReference,
} from '@eduvault/api-contract';
import { FilesService } from '../../../src/app/common/files/files.service';
import { ClassLevelService } from '../../../src/app/modules/class/class-level.service';
import { DeliveryService } from '../../../src/app/modules/store/delivery.service';
import { ItemService } from '../../../src/app/modules/store/item.service';
import { SaleService } from '../../../src/app/modules/store/sale.service';
import { StockCountService } from '../../../src/app/modules/store/stock-count.service';
import { DEMO_CAMPUSES } from './config';
import {
  campusIdOf,
  found,
  moveClock,
  staffContext,
  type DemoRun,
  type PeopleFacts,
  type SchoolFacts,
} from './demo-run';
import { bursarOf, proofOf, type MoneyFacts } from './money';
import {
  DELIVERY_DAYS_AGO,
  DELIVERY_SUPPLIER,
  deliveryLines,
  openingQuantity,
  OPENING_DAYS_AGO,
  STORE_ITEMS,
  type SalePlan,
  type StockCountPlan,
} from './store-plan';

export interface StoreFacts {
  itemIds: ReadonlyMap<string, string>;
}

interface StoreRun {
  run: DemoRun;
  school: SchoolFacts;
  people: PeopleFacts;
  money: MoneyFacts;
  itemIds: ReadonlyMap<string, string>;
}

const DAY_OF_COUNT_DECISION = 1;

async function createItems(
  run: DemoRun,
  school: SchoolFacts
): Promise<Map<string, string>> {
  const levels = await run.app
    .get(ClassLevelService, { strict: false })
    .list(school.owner);
  const items = run.app.get(ItemService, { strict: false });
  const itemIds = new Map<string, string>();
  for (const item of STORE_ITEMS) {
    const created = await items.create(school.owner, {
      kind: item.kind,
      name: item.name,
      variant: item.variant,
      classLevelId:
        item.levelCode === null
          ? null
          : found(
              levels.find((level) => level.code === item.levelCode),
              `level ${item.levelCode}`
            ).id,
      costPriceMinor: item.costMinor,
      sellPriceMinor: item.priceMinor,
      lowStockLevel: item.lowStockLevel,
    });
    itemIds.set(item.key, created.id);
  }
  return itemIds;
}

const itemOf = (key: string) =>
  found(
    STORE_ITEMS.find((item) => item.key === key),
    `item ${key}`
  );

async function stockCampuses(context: StoreRun): Promise<void> {
  const { run, school, money, itemIds } = context;
  const deliveries = run.app.get(DeliveryService, { strict: false });
  for (const campus of DEMO_CAMPUSES) {
    const bursar = bursarOf(money, campus);
    const campusId = campusIdOf(school, campus);
    await deliveries.record(bursar, {
      reference: `DEMO-OPENING-${campus.toUpperCase()}`,
      campusId,
      supplierName: OPENING_STOCK_SUPPLIER,
      isOpening: true,
      receivedOn: moveClock(run, OPENING_DAYS_AGO),
      lines: STORE_ITEMS.map((item, index) => ({
        itemId: found(itemIds.get(item.key), item.key),
        quantity: openingQuantity(index, campus),
        unitCostMinor: item.costMinor,
      })),
    });
    await deliveries.record(bursar, {
      reference: `DEMO-DELIVERY-${campus.toUpperCase()}`,
      campusId,
      supplierName: DELIVERY_SUPPLIER,
      moneyAccountId: found(money.bankAccounts.get(campus), `bank ${campus}`),
      receivedOn: moveClock(run, DELIVERY_DAYS_AGO),
      lines: deliveryLines(campus).map((line) => ({
        itemId: found(itemIds.get(line.item), line.item),
        quantity: line.quantity,
        unitCostMinor: itemOf(line.item).costMinor,
      })),
    });
  }
}

async function recordSale(context: StoreRun, sale: SalePlan): Promise<void> {
  const { run, money, people, itemIds } = context;
  const bursar = bursarOf(money, sale.campus);
  const day = moveClock(run, sale.daysAgo);
  const proof =
    sale.method === 'transfer'
      ? await run.app.get(FilesService, { strict: false }).upload(bursar, {
          kind: 'payment_proof',
          file: proofOf(`store-transfer-slip-${sale.number}`),
        })
      : undefined;
  const accounts =
    sale.method === 'transfer' ? money.bankAccounts : money.cashBoxes;
  await run.app.get(SaleService, { strict: false }).record(bursar, {
    reference: storeSaleReference(
      day,
      `de30${sale.number.toString(16).padStart(4, '0')}`
    ),
    studentId: found(
      people.studentIds.get(sale.student),
      `student ${sale.student}`
    ),
    method: sale.method,
    moneyAccountId: found(
      accounts.get(sale.campus),
      `account for ${sale.campus}`
    ),
    proofFileId: proof?.id,
    lines: sale.lines.map((line) => ({
      itemId: found(itemIds.get(line.item), line.item),
      quantity: line.quantity,
    })),
  });
}

async function runCount(
  context: StoreRun,
  count: StockCountPlan
): Promise<void> {
  const { run, school, money, itemIds } = context;
  const counts = run.app.get(StockCountService, { strict: false });
  const bursar = bursarOf(money, count.campus);
  moveClock(run, count.daysAgo);
  const submitted = await counts.submit(bursar, {
    campusId: campusIdOf(school, count.campus),
    note: count.note,
    lines: count.lines.map((line) => ({
      itemId: found(itemIds.get(line.item), line.item),
      countedQuantity: line.held - line.missing,
    })),
  });
  if (count.decision === 'approved') {
    moveClock(run, Math.max(DAY_OF_COUNT_DECISION, count.daysAgo - 1));
    await counts.approve(await staffContext(run, 'principal'), submitted.id);
  }
}

export async function runStore(
  run: DemoRun,
  facts: { school: SchoolFacts; people: PeopleFacts; money: MoneyFacts }
): Promise<StoreFacts> {
  moveClock(run, OPENING_DAYS_AGO);
  const itemIds = await createItems(run, facts.school);
  const context: StoreRun = { run, ...facts, itemIds };
  await stockCampuses(context);
  for (const sale of run.plan.store.sales) {
    await recordSale(context, sale);
  }
  for (const count of run.plan.store.counts) {
    await runCount(context, count);
  }
  return { itemIds };
}
