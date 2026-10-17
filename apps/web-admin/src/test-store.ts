import type {
  Campus,
  Delivery,
  DeliveryList,
  Item,
  ItemList,
  MoneyAccount,
  MoneyAccountList,
  RecordedDelivery,
  StockRow,
  StoreSummary,
} from '@eduvault/api-contract';
import { IKEJA, LEKKI } from './test-members';

export const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-0000000f0101';
export const LEVEL_ID = '00000000-0000-4000-8000-0000000f0201';
export const SHIRT_ID = '00000000-0000-4000-8000-0000000f0301';
const TIE_ID = '00000000-0000-4000-8000-0000000f0302';
const BOOK_ID = '00000000-0000-4000-8000-0000000f0303';
const DELIVERY_ID = '00000000-0000-4000-8000-0000000f0401';
const OPENING_ID = '00000000-0000-4000-8000-0000000f0402';

const stockRow = (
  campus: Pick<Campus, 'id'>,
  onHand: number,
  averageCostMinor: number
): StockRow => ({
  campusId: campus.id,
  onHand,
  valueMinor: onHand * averageCostMinor,
  averageCostMinor,
});

const item = (over: Partial<Item> & Pick<Item, 'id' | 'name'>): Item => ({
  kind: 'uniform',
  variant: null,
  displayName: over.name,
  classLevel: null,
  costPriceMinor: 350_000,
  sellPriceMinor: 550_000,
  lowStockLevel: 5,
  retiredAt: null,
  stock: [],
  state: 'in',
  ...over,
});

export const shirt = (campuses: readonly Campus[] = [LEKKI, IKEJA]): Item =>
  item({
    id: SHIRT_ID,
    name: 'School shirt',
    variant: 'Size 12',
    displayName: 'School shirt, Size 12',
    stock: campuses.map((campus) =>
      stockRow(campus, campus.id === LEKKI.id ? 12 : 0, 350_000)
    ),
    state: 'low',
  });

export const tie = (campuses: readonly Campus[] = [LEKKI, IKEJA]): Item =>
  item({
    id: TIE_ID,
    name: 'School tie',
    costPriceMinor: 120_000,
    sellPriceMinor: 200_000,
    stock: campuses.map((campus) => stockRow(campus, 5, 120_000)),
    state: 'low',
  });

export const textbook = (campuses: readonly Campus[] = [LEKKI, IKEJA]): Item =>
  item({
    id: BOOK_ID,
    kind: 'book',
    name: 'Mathematics',
    classLevel: { id: LEVEL_ID, name: 'JSS 1' },
    costPriceMinor: 250_000,
    sellPriceMinor: 400_000,
    stock: campuses.map((campus) => stockRow(campus, 30, 250_000)),
  });

export const itemList = (items: Item[]): ItemList => ({
  items,
  total: items.length,
});

export const storeSummary = (
  over: Partial<StoreSummary> = {}
): StoreSummary => ({
  stockValueMinor: 7_000_000,
  lowCount: 2,
  ...over,
});

const delivery = (over: Partial<Delivery> = {}): Delivery => ({
  id: DELIVERY_ID,
  number: 'DEL-2026-0001',
  reference: 'DEL-REQ-20260901-AB12CD34',
  campusId: LEKKI.id,
  supplierName: 'Adebayo Uniforms Ltd',
  moneyAccount: { id: BANK_ACCOUNT_ID, name: 'GTBank current' },
  isOpening: false,
  receivedOn: '2026-09-15',
  receivedBy: 'Chika Eze',
  totalMinor: 3_500_000,
  itemCount: 1,
  ...over,
});

export const openingDelivery = (): Delivery =>
  delivery({
    id: OPENING_ID,
    number: `OPEN-STORE-${LEKKI.id}`,
    supplierName: 'Opening stock count',
    moneyAccount: null,
    isOpening: true,
    receivedOn: '2026-09-01',
    totalMinor: 10_000_000,
    itemCount: 3,
  });

export const deliveryList = (
  items: Delivery[] = [delivery()],
  suppliers: string[] = ['Adebayo Uniforms Ltd']
): DeliveryList => ({ items, total: items.length, suppliers });

export const recordedDelivery = (
  over: Partial<RecordedDelivery> = {}
): RecordedDelivery => ({
  ...delivery(),
  lines: [
    {
      itemId: SHIRT_ID,
      displayName: 'School shirt, Size 12',
      retired: false,
      quantity: 10,
      unitCostMinor: 350_000,
      totalMinor: 3_500_000,
    },
  ],
  replayed: false,
  ...over,
});

const bankAccount = (over: Partial<MoneyAccount> = {}): MoneyAccount => ({
  id: BANK_ACCOUNT_ID,
  name: 'GTBank current',
  kind: 'bank',
  campusId: null,
  campusName: null,
  bankName: 'GTBank',
  last4: '4417',
  ledgerAccountId: '00000000-0000-4000-8000-0000000f0501',
  ledgerCode: 1210,
  balanceMinor: 50_000_000,
  retiredAt: null,
  ...over,
});

export const moneyAccountList = (
  items: MoneyAccount[] = [bankAccount()]
): MoneyAccountList => ({
  currency: 'NGN',
  items,
  hiddenSchoolWideCount: 0,
});
