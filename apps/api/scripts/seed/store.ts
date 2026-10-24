import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'kysely';
import {
  OPENING_STOCK_SUPPLIER,
  itemDisplayName,
  storeSaleReference,
  type PaymentMethod,
  type RecordDelivery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../src/app/common/auth';
import { Clock } from '../../src/app/common/clock';
import { KYSELY_TOKEN, type Database } from '../../src/app/common/db/tokens';
import { FilesService } from '../../src/app/common/files/files.service';
import { DeliveryService } from '../../src/app/modules/store/delivery.service';
import { ItemService } from '../../src/app/modules/store/item.service';
import { SaleService } from '../../src/app/modules/store/sale.service';
import { StockCountService } from '../../src/app/modules/store/stock-count.service';
import { orgContextFor } from './actors';
import { shiftDate } from './date-shift';
import { emailOf } from './members';

type SeedCampus = 'Lekki' | 'Ikeja';

interface SeedUniform {
  name: string;
  sizes: readonly string[];
  costMinor: number;
  priceMinor: number;
  lowLevel: number;
}

interface SeedBook {
  name: string;
  level: string;
  costMinor: number;
  priceMinor: number;
}

const UNIFORM_SIZES = ['Size 10', 'Size 12', 'Size 14', 'Size 16'];

const SEED_UNIFORMS: readonly SeedUniform[] = [
  {
    name: 'School shirt',
    sizes: UNIFORM_SIZES,
    costMinor: 350_000,
    priceMinor: 450_000,
    lowLevel: 5,
  },
  {
    name: 'School trousers',
    sizes: UNIFORM_SIZES,
    costMinor: 500_000,
    priceMinor: 650_000,
    lowLevel: 5,
  },
  {
    name: 'Pinafore',
    sizes: UNIFORM_SIZES,
    costMinor: 550_000,
    priceMinor: 700_000,
    lowLevel: 5,
  },
  {
    name: 'Sportswear set',
    sizes: ['Small', 'Medium', 'Large'],
    costMinor: 600_000,
    priceMinor: 800_000,
    lowLevel: 5,
  },
  {
    name: 'School tie',
    sizes: [],
    costMinor: 120_000,
    priceMinor: 180_000,
    lowLevel: 10,
  },
];

const SEED_BOOKS: readonly SeedBook[] = [
  {
    name: 'Mathematics',
    level: 'JSS1',
    costMinor: 250_000,
    priceMinor: 320_000,
  },
  {
    name: 'English Language',
    level: 'JSS1',
    costMinor: 230_000,
    priceMinor: 300_000,
  },
  {
    name: 'Basic Science',
    level: 'JSS1',
    costMinor: 260_000,
    priceMinor: 340_000,
  },
  {
    name: 'Mathematics',
    level: 'JSS2',
    costMinor: 270_000,
    priceMinor: 350_000,
  },
  {
    name: 'English Language',
    level: 'JSS2',
    costMinor: 240_000,
    priceMinor: 310_000,
  },
  {
    name: 'Basic Technology',
    level: 'JSS2',
    costMinor: 280_000,
    priceMinor: 360_000,
  },
  {
    name: 'Mathematics',
    level: 'JSS3',
    costMinor: 290_000,
    priceMinor: 370_000,
  },
  {
    name: 'English Language',
    level: 'JSS3',
    costMinor: 250_000,
    priceMinor: 320_000,
  },
  {
    name: 'Business Studies',
    level: 'JSS3',
    costMinor: 300_000,
    priceMinor: 390_000,
  },
  {
    name: 'Mathematics',
    level: 'SS1',
    costMinor: 320_000,
    priceMinor: 420_000,
  },
  {
    name: 'English Language',
    level: 'SS1',
    costMinor: 280_000,
    priceMinor: 360_000,
  },
];

const OPENING_ON = '2026-09-01';
const DELIVERED_ON = '2026-09-21';
const SUPPLIER = 'Adebayo Uniforms Ltd';
const PAID_FROM = 'GTBank current';

const IKEJA_LOW = 'School shirt, Size 14';
const IKEJA_OUT = 'Pinafore, Size 16';
const IKEJA_LOW_QUANTITY = 3;

const SEED_DELIVERY_LINES: readonly {
  displayName: string;
  quantity: number;
}[] = [
  { displayName: 'School shirt, Size 12', quantity: 20 },
  { displayName: 'School shirt, Size 14', quantity: 20 },
  { displayName: 'School trousers, Size 12', quantity: 10 },
];

interface SeedSale {
  on: string;
  student: string;
  method: PaymentMethod;
  account?: string;
  lines: readonly { item: string; quantity: number }[];
}

/** In date order, so receipt numbers climb with the dates. */
const SEED_SALES: readonly SeedSale[] = [
  {
    on: '2026-09-22',
    student: 'Peace Akpan',
    method: 'pos',
    account: 'Moniepoint POS',
    lines: [
      { item: 'School shirt, Size 12', quantity: 2 },
      { item: 'Mathematics (JSS2)', quantity: 1 },
    ],
  },
  {
    on: '2026-09-23',
    student: 'Ada Okeke',
    method: 'cash',
    lines: [
      { item: 'School shirt, Size 12', quantity: 1 },
      { item: 'School tie', quantity: 1 },
      { item: 'English Language (JSS2)', quantity: 1 },
    ],
  },
  {
    on: '2026-09-28',
    student: 'Tobi Adewale',
    method: 'transfer',
    lines: [{ item: 'School trousers, Size 12', quantity: 2 }],
  },
  {
    on: '2026-09-30',
    student: 'Femi Lawal',
    method: 'cash',
    lines: [{ item: 'School shirt, Size 12', quantity: 2 }],
  },
  {
    on: '2026-10-01',
    student: 'Amara Nwachukwu',
    method: 'cash',
    lines: [
      { item: 'Mathematics (JSS1)', quantity: 1 },
      { item: 'English Language (JSS1)', quantity: 1 },
      { item: 'Basic Science (JSS1)', quantity: 1 },
    ],
  },
  {
    on: '2026-10-05',
    student: 'Zainab Bello',
    method: 'pos',
    account: 'Moniepoint POS',
    lines: [
      { item: 'Pinafore, Size 14', quantity: 1 },
      { item: 'Sportswear set, Medium', quantity: 1 },
    ],
  },
  {
    on: '2026-10-06',
    student: 'Kayode Martins',
    method: 'transfer',
    lines: [
      { item: 'Mathematics (JSS2)', quantity: 1 },
      { item: 'School tie', quantity: 2 },
    ],
  },
];

const COUNT_NOTE = 'Shelf count after mid-term stock check';
const SEED_COUNT_SHORTAGES: readonly { item: string; missing: number }[] = [
  { item: 'School shirt, Size 14', missing: 2 },
  { item: 'School tie', missing: 1 },
];

const PROOF_METHODS = new Set<PaymentMethod>(['pos', 'transfer']);

export const SEED_SALE_COUNT = SEED_SALES.length;
export const SEED_STORE_ENTRIES = 3 + SEED_SALE_COUNT * 3;

interface StoreSeed {
  owner: OrgContext;
  campusIds: Map<string, string>;
  school: string;
  today: string;
  offsetDays: number;
}

interface Stocked {
  id: string;
  displayName: string;
  costMinor: number;
}

function openingQuantity(index: number, campus: SeedCampus): number {
  return campus === 'Lekki' ? 20 + (index % 5) * 4 : 12 + (index % 4) * 3;
}

async function levelIds(
  db: Database,
  organizationId: string
): Promise<Map<string, string>> {
  const rows = await db
    .selectFrom('class_level')
    .select(['id', 'code'])
    .where('organization_id', '=', organizationId)
    .execute();
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function createItems(
  app: INestApplicationContext,
  owner: OrgContext
): Promise<Stocked[]> {
  const items = app.get(ItemService, { strict: false });
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const levels = await levelIds(db, owner.organizationId);
  const stocked: Stocked[] = [];
  for (const uniform of SEED_UNIFORMS) {
    for (const size of uniform.sizes.length === 0 ? [null] : uniform.sizes) {
      const created = await items.create(owner, {
        kind: 'uniform',
        name: uniform.name,
        variant: size,
        classLevelId: null,
        costPriceMinor: uniform.costMinor,
        sellPriceMinor: uniform.priceMinor,
        lowStockLevel: uniform.lowLevel,
      });
      stocked.push({
        id: created.id,
        displayName: created.displayName,
        costMinor: uniform.costMinor,
      });
    }
  }
  for (const book of SEED_BOOKS) {
    const classLevelId = levels.get(book.level);
    if (classLevelId === undefined) {
      throw new Error(`Seed has no class level ${book.level}`);
    }
    const created = await items.create(owner, {
      kind: 'book',
      name: book.name,
      variant: null,
      classLevelId,
      costPriceMinor: book.costMinor,
      sellPriceMinor: book.priceMinor,
      lowStockLevel: 5,
    });
    stocked.push({
      id: created.id,
      displayName: `${itemDisplayName(created)} (${book.level})`,
      costMinor: book.costMinor,
    });
  }
  return stocked;
}

function openingLines(
  stocked: readonly Stocked[],
  campus: SeedCampus
): RecordDelivery['lines'] {
  return stocked.flatMap((item, index) => {
    if (campus === 'Ikeja' && item.displayName === IKEJA_OUT) {
      return [];
    }
    const quantity =
      campus === 'Ikeja' && item.displayName === IKEJA_LOW
        ? IKEJA_LOW_QUANTITY
        : openingQuantity(index, campus);
    return [{ itemId: item.id, quantity, unitCostMinor: item.costMinor }];
  });
}

async function moneyAccountId(
  db: Database,
  organizationId: string,
  name: string
): Promise<string> {
  const row = await db
    .selectFrom('money_account')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('name', '=', name)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function studentIdOf(
  db: Database,
  organizationId: string,
  name: string
): Promise<string> {
  const row = await db
    .selectFrom('student')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where(sql<string>`first_name || ' ' || last_name`, '=', name)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function seedSales(
  app: INestApplicationContext,
  seed: Pick<StoreSeed, 'owner' | 'offsetDays'>,
  stocked: readonly Stocked[]
) {
  const clock = app.get(Clock, { strict: false });
  const sales = app.get(SaleService, { strict: false });
  const files = app.get(FilesService, { strict: false });
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const { owner } = seed;
  for (const [index, sale] of SEED_SALES.entries()) {
    const day = shiftDate(sale.on, seed.offsetDays);
    clock.set(day);
    const proof = PROOF_METHODS.has(sale.method)
      ? await files.upload(owner, {
          kind: 'payment_proof',
          file: {
            originalname: `${sale.method}-slip-${index + 1}.pdf`,
            buffer: Buffer.from(
              `%PDF-1.7\n% ${sale.method} slip ${index + 1} for ${sale.student}\n`
            ),
          },
        })
      : undefined;
    await sales.record(owner, {
      reference: storeSaleReference(
        day,
        `5eed${String(index + 1).padStart(4, '0')}`
      ),
      studentId: await studentIdOf(db, owner.organizationId, sale.student),
      method: sale.method,
      proofFileId: proof?.id,
      moneyAccountId:
        sale.account === undefined
          ? undefined
          : await moneyAccountId(db, owner.organizationId, sale.account),
      lines: sale.lines.map((line) => {
        const item = stocked.find(
          (candidate) => candidate.displayName === line.item
        );
        if (item === undefined) {
          throw new Error(`Seed has no item ${line.item}`);
        }
        return { itemId: item.id, quantity: line.quantity };
      }),
    });
  }
}

async function onHand(
  db: Database,
  seed: { organizationId: string; campusId: string; itemId: string }
): Promise<number> {
  const row = await db
    .selectFrom('stock_movement')
    .innerJoin('store', 'store.id', 'stock_movement.store_id')
    .select(sql<string>`coalesce(sum(stock_movement.quantity), 0)`.as('total'))
    .where('stock_movement.organization_id', '=', seed.organizationId)
    .where('store.campus_id', '=', seed.campusId)
    .where('stock_movement.item_id', '=', seed.itemId)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

async function seedCount(
  app: INestApplicationContext,
  seed: { campusId: string; organizationId: string },
  stocked: readonly Stocked[]
) {
  const counts = app.get(StockCountService, { strict: false });
  const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
  const bursar = await orgContextFor(app, emailOf('chika'));
  const lines = [];
  for (const shortage of SEED_COUNT_SHORTAGES) {
    const item = stocked.find(
      (candidate) => candidate.displayName === shortage.item
    );
    if (item === undefined) {
      throw new Error(`Seed has no item ${shortage.item}`);
    }
    const held = await onHand(db, { ...seed, itemId: item.id });
    if (held < shortage.missing) {
      throw new Error(`Seed holds too little ${shortage.item} to count short`);
    }
    lines.push({
      itemId: item.id,
      countedQuantity: held - shortage.missing,
    });
  }
  await counts.submit(bursar, {
    campusId: seed.campusId,
    note: COUNT_NOTE,
    lines,
  });
}

export async function seedStore(
  app: INestApplicationContext,
  { owner, campusIds, school, today, offsetDays }: StoreSeed
) {
  const clock = app.get(Clock, { strict: false });
  try {
    const stocked = await createItems(app, owner);
    const deliveries = app.get(DeliveryService, { strict: false });
    const campusId = (campus: SeedCampus): string => {
      const found = campusIds.get(`${school}/${campus}`);
      if (found === undefined) {
        throw new Error(`Seed has no campus ${campus}`);
      }
      return found;
    };
    for (const campus of ['Lekki', 'Ikeja'] as const) {
      await deliveries.record(owner, {
        reference: `SEED-OPENING-${campus.toUpperCase()}`,
        campusId: campusId(campus),
        supplierName: OPENING_STOCK_SUPPLIER,
        isOpening: true,
        receivedOn: shiftDate(OPENING_ON, offsetDays),
        lines: openingLines(stocked, campus),
      });
    }
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    await deliveries.record(owner, {
      reference: 'SEED-DELIVERY-0001',
      campusId: campusId('Lekki'),
      supplierName: SUPPLIER,
      moneyAccountId: await moneyAccountId(db, owner.organizationId, PAID_FROM),
      receivedOn: shiftDate(DELIVERED_ON, offsetDays),
      lines: SEED_DELIVERY_LINES.map((line) => {
        const item = stocked.find(
          (candidate) => candidate.displayName === line.displayName
        );
        if (item === undefined) {
          throw new Error(`Seed has no item ${line.displayName}`);
        }
        return {
          itemId: item.id,
          quantity: line.quantity,
          unitCostMinor: item.costMinor,
        };
      }),
    });
    await seedSales(app, { owner, offsetDays }, stocked);
    await seedCount(
      app,
      {
        campusId: campusId('Lekki'),
        organizationId: owner.organizationId,
      },
      stocked
    );
  } finally {
    clock.set(today);
  }
}
