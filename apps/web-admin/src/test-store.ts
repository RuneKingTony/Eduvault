import type {
  Campus,
  Delivery,
  DeliveryDetail,
  DeliveryLine,
  DeliveryList,
  Item,
  ItemList,
  MoneyAccount,
  MoneyAccountList,
  RecordedDelivery,
  RecordedSale,
  Sale,
  SaleList,
  SaleOptions,
  StockCount,
  StockCountList,
  StockRow,
  StoreSummary,
  StoreTermFigures,
} from '@eduvault/api-contract';
import { IKEJA, LEKKI } from './test-members';

export const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-0000000f0101';
export const LEVEL_ID = '00000000-0000-4000-8000-0000000f0201';
export const SHIRT_ID = '00000000-0000-4000-8000-0000000f0301';
export const TIE_ID = '00000000-0000-4000-8000-0000000f0302';
const BOOK_ID = '00000000-0000-4000-8000-0000000f0303';
const COUNT_ID = '00000000-0000-4000-8000-0000000f0901';
export const SALE_ID = '00000000-0000-4000-8000-0000000f0601';
export const ADA_ID = '00000000-0000-4000-8000-0000000f0701';
export const TOBI_ID = '00000000-0000-4000-8000-0000000f0702';
export const PROOF_ID = '00000000-0000-4000-8000-0000000f0603';
export const DELIVERY_ID = '00000000-0000-4000-8000-0000000f0401';
export const OPENING_ID = '00000000-0000-4000-8000-0000000f0402';

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

export const NO_SALES: StoreTermFigures = {
  termSalesMinor: 0,
  termCostMinor: 0,
  termSalesCount: 0,
  termItemsSold: 0,
  termStudentsServed: 0,
};

export const termFigures = (
  over: Partial<StoreTermFigures> = {}
): StoreTermFigures => ({
  termSalesMinor: 2_700_000,
  termCostMinor: 2_000_000,
  termSalesCount: 4,
  termItemsSold: 9,
  termStudentsServed: 3,
  ...over,
});

export const storeSummary = (
  over: Partial<StoreSummary> = {}
): StoreSummary => ({
  stockValueMinor: 7_000_000,
  lowCount: 2,
  ...termFigures(),
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

export const deliveryLine = (
  over: Partial<DeliveryLine> = {}
): DeliveryLine => ({
  itemId: SHIRT_ID,
  itemName: 'School shirt',
  displayName: 'School shirt, Size 12',
  retired: false,
  quantity: 10,
  unitCostMinor: 350_000,
  totalMinor: 3_500_000,
  ...over,
});

export const deliveryDetail = (
  over: Partial<DeliveryDetail> = {}
): DeliveryDetail => ({
  ...delivery(),
  lines: [deliveryLine()],
  ...over,
});

export const openingDeliveryDetail = (): DeliveryDetail => ({
  ...openingDelivery(),
  itemCount: 2,
  lines: [
    deliveryLine({ quantity: 20, totalMinor: 7_000_000 }),
    deliveryLine({
      itemId: TIE_ID,
      itemName: 'School tie',
      displayName: 'School tie',
      quantity: 25,
      unitCostMinor: 120_000,
      totalMinor: 3_000_000,
    }),
  ],
});

export const recordedDelivery = (
  over: Partial<RecordedDelivery> = {}
): RecordedDelivery => ({
  ...deliveryDetail(),
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

export const sale = (over: Partial<Sale> = {}): Sale => ({
  id: SALE_ID,
  number: 'ISS-2026-0001',
  reference: 'STORE-20260922-AB12CD34',
  soldOn: '2026-09-22',
  student: {
    id: ADA_ID,
    name: 'Ada Okeke',
    admissionNumber: 'GF-0123',
    className: 'JSS 1 Gold',
  },
  campusId: LEKKI.id,
  campusName: 'Lekki',
  soldBy: 'Chika Eze',
  lines: [
    {
      itemId: SHIRT_ID,
      displayName: 'School shirt, Size 12',
      quantity: 2,
      unitPriceMinor: 550_000,
      amountMinor: 1_100_000,
      costMinor: 700_000,
      unitCostMinor: 350_000,
    },
    {
      itemId: TIE_ID,
      displayName: 'School tie',
      quantity: 1,
      unitPriceMinor: 200_000,
      amountMinor: 200_000,
      costMinor: 120_000,
      unitCostMinor: 120_000,
    },
  ],
  totalMinor: 1_300_000,
  costMinor: 820_000,
  chargeId: '00000000-0000-4000-8000-0000000f0602',
  chargeNumber: 'CHG-2026-00001',
  paymentId: '00000000-0000-4000-8000-0000000f0604',
  receiptNumber: 'RCT-2026-00012',
  method: 'pos',
  proof: { fileId: PROOF_ID, fileName: 'pos-slip.pdf' },
  ...over,
});

export const saleList = (items: Sale[] = [sale()]): SaleList => ({
  items,
  total: items.length,
});

export const recordedSale = (
  over: Partial<RecordedSale> = {}
): RecordedSale => ({
  ...sale(),
  replayed: false,
  ...over,
});

export const CASH_BOX_ID = '00000000-0000-4000-8000-0000000f0801';
export const POS_ID = '00000000-0000-4000-8000-0000000f0802';

export const saleOptions = (over: Partial<SaleOptions> = {}): SaleOptions => ({
  students: [
    {
      id: ADA_ID,
      name: 'Ada Okeke',
      admissionNumber: 'GF-0123',
      className: 'JSS 1 Gold',
      levelId: LEVEL_ID,
      levelName: 'JSS 1',
      campusId: LEKKI.id,
      campusName: 'Lekki',
      balanceMinor: 1_250_000,
    },
    {
      id: TOBI_ID,
      name: 'Tobi Adewale',
      admissionNumber: 'GF-0124',
      className: 'JSS 1 Blue',
      levelId: LEVEL_ID,
      levelName: 'JSS 1',
      campusId: IKEJA.id,
      campusName: 'Ikeja',
      balanceMinor: -300_000,
    },
  ],
  methods: { cash: true, transfer: true, pos: true },
  accounts: [
    {
      id: CASH_BOX_ID,
      name: 'Lekki cash box',
      kind: 'cash',
      campusId: LEKKI.id,
    },
    { id: POS_ID, name: 'Moniepoint POS', kind: 'pos', campusId: LEKKI.id },
    {
      id: BANK_ACCOUNT_ID,
      name: 'GTBank current',
      kind: 'bank',
      campusId: null,
    },
  ],
  ...over,
});

export const stockCount = (over: Partial<StockCount> = {}): StockCount => ({
  id: COUNT_ID,
  number: 'CNT-2026-0001',
  campusId: LEKKI.id,
  campusName: 'Lekki',
  status: 'submitted',
  note: 'Shelf count after mid-term stock check',
  createdAt: '2026-10-16T09:30:00.000Z',
  countedBy: { id: '00000000-0000-4000-8000-0000000f0a01', name: 'Chika Eze' },
  decidedBy: null,
  rejectionReason: null,
  netValueMinor: 820_000,
  differences: 'School shirt, Size 12: 2 missing; School tie: 1 missing',
  lines: [
    {
      itemId: SHIRT_ID,
      displayName: 'School shirt, Size 12',
      expectedQuantity: 12,
      countedQuantity: 10,
      difference: -2,
      valueMinor: 700_000,
    },
    {
      itemId: TIE_ID,
      displayName: 'School tie',
      expectedQuantity: 5,
      countedQuantity: 4,
      difference: -1,
      valueMinor: 120_000,
    },
    {
      itemId: BOOK_ID,
      displayName: 'Mathematics',
      expectedQuantity: 30,
      countedQuantity: 30,
      difference: 0,
      valueMinor: 0,
    },
  ],
  ...over,
});

export const stockCountList = (
  items: StockCount[] = [stockCount()]
): StockCountList => ({ items, total: items.length });
