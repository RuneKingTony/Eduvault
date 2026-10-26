import { DEMO_CAMPUSES, type DemoCampus } from './config';
import type { PaymentMethodPlan } from './money-plan';
import { oldestFirst } from './ordering';
import type { StudentNumber } from './people-plan';
import type { Random } from './prng';

interface StoreItemPlan {
  key: string;
  kind: 'uniform' | 'book';
  name: string;
  variant: string | null;
  levelCode: string | null;
  costMinor: number;
  priceMinor: number;
  lowStockLevel: number;
}

interface UniformRange {
  name: string;
  sizes: readonly string[];
  costMinor: number;
  priceMinor: number;
  lowStockLevel: number;
}

const CLOTHING_SIZES = ['Size 10', 'Size 12', 'Size 14', 'Size 16'];

const UNIFORMS: readonly UniformRange[] = [
  {
    name: 'School shirt',
    sizes: CLOTHING_SIZES,
    costMinor: 350_000,
    priceMinor: 450_000,
    lowStockLevel: 6,
  },
  {
    name: 'School shorts',
    sizes: CLOTHING_SIZES,
    costMinor: 450_000,
    priceMinor: 600_000,
    lowStockLevel: 6,
  },
  {
    name: 'School skirt',
    sizes: CLOTHING_SIZES,
    costMinor: 500_000,
    priceMinor: 650_000,
    lowStockLevel: 6,
  },
  {
    name: 'School tie',
    sizes: [],
    costMinor: 120_000,
    priceMinor: 180_000,
    lowStockLevel: 10,
  },
  {
    name: 'Sports kit',
    sizes: ['Small', 'Medium', 'Large'],
    costMinor: 600_000,
    priceMinor: 800_000,
    lowStockLevel: 5,
  },
];

const TEXTBOOKS = [
  { level: 'P4', name: 'Mathematics', costMinor: 220_000, priceMinor: 290_000 },
  {
    level: 'P5',
    name: 'English Language',
    costMinor: 230_000,
    priceMinor: 300_000,
  },
  {
    level: 'P6',
    name: 'Basic Science',
    costMinor: 250_000,
    priceMinor: 330_000,
  },
  {
    level: 'JSS1',
    name: 'Mathematics',
    costMinor: 250_000,
    priceMinor: 320_000,
  },
  {
    level: 'JSS2',
    name: 'English Language',
    costMinor: 240_000,
    priceMinor: 310_000,
  },
  {
    level: 'JSS3',
    name: 'Basic Technology',
    costMinor: 280_000,
    priceMinor: 360_000,
  },
  {
    level: 'SS1',
    name: 'Mathematics',
    costMinor: 320_000,
    priceMinor: 420_000,
  },
  { level: 'SS2', name: 'Physics', costMinor: 340_000, priceMinor: 440_000 },
] as const;

const slugOf = (text: string): string =>
  text.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');

function uniformItems(): StoreItemPlan[] {
  return UNIFORMS.flatMap((range) =>
    (range.sizes.length === 0 ? [null] : range.sizes).map((variant) => ({
      key: slugOf(variant === null ? range.name : `${range.name} ${variant}`),
      kind: 'uniform' as const,
      name: range.name,
      variant,
      levelCode: null,
      costMinor: range.costMinor,
      priceMinor: range.priceMinor,
      lowStockLevel: range.lowStockLevel,
    }))
  );
}

function bookItems(): StoreItemPlan[] {
  return TEXTBOOKS.map((book) => ({
    key: slugOf(`${book.name} ${book.level}`),
    kind: 'book' as const,
    name: book.name,
    variant: null,
    levelCode: book.level,
    costMinor: book.costMinor,
    priceMinor: book.priceMinor,
    lowStockLevel: 5,
  }));
}

export const STORE_ITEMS: readonly StoreItemPlan[] = [
  ...uniformItems(),
  ...bookItems(),
];

export const openingQuantity = (index: number, campus: DemoCampus): number =>
  campus === 'Main' ? 20 + (index % 5) * 4 : 12 + (index % 4) * 3;

export const OPENING_DAYS_AGO = 36;
export const DELIVERY_DAYS_AGO = 28;
export const DELIVERY_SUPPLIER = 'Adebayo Uniforms Ltd';

const DELIVERY_QUANTITY: Readonly<Record<DemoCampus, number>> = {
  Main: 15,
  Annex: 10,
};

interface DeliveryLinePlan {
  item: string;
  quantity: number;
}

export function deliveryLines(campus: DemoCampus): DeliveryLinePlan[] {
  return STORE_ITEMS.filter(
    (item, index) => item.kind === 'uniform' && index % 2 === 0
  ).map((item) => ({ item: item.key, quantity: DELIVERY_QUANTITY[campus] }));
}

export interface SaleLinePlan {
  item: string;
  quantity: number;
}

export interface SalePlan {
  /** 1-based, in the order the sales are recorded; it makes the fixed reference. */
  number: number;
  student: StudentNumber;
  campus: DemoCampus;
  method: PaymentMethodPlan;
  daysAgo: number;
  lines: SaleLinePlan[];
}

export interface StockCountPlan {
  campus: DemoCampus;
  daysAgo: number;
  decision: 'waiting' | 'approved';
  note: string;
  lines: { item: string; held: number; missing: number }[];
}

export interface StorePlan {
  sales: SalePlan[];
  counts: StockCountPlan[];
}

export interface Buyer {
  student: StudentNumber;
  campus: DemoCampus;
  levelCode: string;
}

const SALE_COUNT = 40;
const SALE_WINDOW_DAYS = { newest: 3, oldest: 34 };
const TRANSFER_SHARE = 0.25;
const BOOK_SHARE = 0.4;
const PAIR_SHARE = 0.35;
const DOUBLE_SHARE = 0.2;

const MAIN_COUNT = {
  daysAgo: 1,
  note: 'Mid-term shelf count; the shirts do not add up',
  shortages: [2, 1],
} as const;
const ANNEX_COUNT = {
  daysAgo: 2,
  note: 'Shelf count after the delivery',
  shortages: [1, 2],
} as const;

type Stock = Map<string, number>;

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`The store plan has no ${what}.`);
  }
  return value;
}

function openingStock(campus: DemoCampus): Stock {
  return new Map(
    STORE_ITEMS.map((item, index) => [item.key, openingQuantity(index, campus)])
  );
}

function pickLines(buyer: Buyer, stock: Stock, random: Random): SaleLinePlan[] {
  const uniforms = STORE_ITEMS.filter((item) => item.kind === 'uniform');
  const book = STORE_ITEMS.find((item) => item.levelCode === buyer.levelCode);
  const wanted = [random.pick(uniforms)];
  if (random.chance(PAIR_SHARE)) {
    wanted.push(random.pick(uniforms));
  }
  if (book !== undefined && random.chance(BOOK_SHARE)) {
    wanted.push(book);
  }
  const lines: SaleLinePlan[] = [];
  for (const item of wanted) {
    const quantity = random.chance(DOUBLE_SHARE) ? 2 : 1;
    const left = stock.get(item.key) ?? 0;
    if (left >= quantity && !lines.some((line) => line.item === item.key)) {
      stock.set(item.key, left - quantity);
      lines.push({ item: item.key, quantity });
    }
  }
  return lines;
}

function planSales(buyers: readonly Buyer[], random: Random): SalePlan[] {
  if (buyers.length === 0) {
    return [];
  }
  const stocks = new Map<DemoCampus, Stock>(
    DEMO_CAMPUSES.map((campus) => [campus, openingStock(campus)])
  );
  const drawn = Array.from({ length: SALE_COUNT }, (_, index) => {
    const buyer = required(buyers[index % buyers.length], 'buyer');
    const stock = required(stocks.get(buyer.campus), 'stock');
    return {
      buyer,
      method: random.chance(TRANSFER_SHARE) ? 'transfer' : 'cash',
      daysAgo: random.between(SALE_WINDOW_DAYS.newest, SALE_WINDOW_DAYS.oldest),
      lines: pickLines(buyer, stock, random),
    } as const;
  });
  return oldestFirst(
    drawn.filter((sale) => sale.lines.length > 0),
    (sale) => sale.daysAgo
  ).map((sale, index) => ({
    number: index + 1,
    student: sale.buyer.student,
    campus: sale.buyer.campus,
    method: sale.method,
    daysAgo: sale.daysAgo,
    lines: sale.lines,
  }));
}

export function heldAfterSales(
  sales: readonly SalePlan[],
  campus: DemoCampus
): Stock {
  const held = openingStock(campus);
  for (const line of deliveryLines(campus)) {
    held.set(line.item, (held.get(line.item) ?? 0) + line.quantity);
  }
  for (const sale of sales.filter((row) => row.campus === campus)) {
    for (const line of sale.lines) {
      held.set(line.item, (held.get(line.item) ?? 0) - line.quantity);
    }
  }
  return held;
}

function planCount(
  campus: DemoCampus,
  sales: readonly SalePlan[],
  random: Random
): StockCountPlan {
  const spec = campus === 'Main' ? MAIN_COUNT : ANNEX_COUNT;
  const held = heldAfterSales(sales, campus);
  const roomy = random.shuffle(
    STORE_ITEMS.filter((item) => (held.get(item.key) ?? 0) >= 4)
  );
  return {
    campus,
    daysAgo: spec.daysAgo,
    decision: campus === 'Main' ? 'waiting' : 'approved',
    note: spec.note,
    lines: spec.shortages.flatMap((missing, index) => {
      const item = roomy[index];
      return item === undefined
        ? []
        : [{ item: item.key, held: held.get(item.key) ?? 0, missing }];
    }),
  };
}

export function planStore(buyers: readonly Buyer[], random: Random): StorePlan {
  const sales = planSales(buyers, random);
  return {
    sales,
    counts: DEMO_CAMPUSES.map((campus) => planCount(campus, sales, random)),
  };
}

export const saleTotalMinor = (sale: SalePlan): number =>
  sale.lines.reduce(
    (total, line) =>
      total +
      line.quantity *
        (STORE_ITEMS.find((item) => item.key === line.item)?.priceMinor ?? 0),
    0
  );

export const emptyStorePlan = (): StorePlan => ({ sales: [], counts: [] });
