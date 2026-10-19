import { z } from 'zod';
import {
  FINANCE_PAGE_SIZE,
  FINANCE_PAGE_SIZE_MAX,
  moneyAccountKindSchema,
  type MoneyAccountKind,
} from './finance';
import {
  RESERVED_REFERENCE_MESSAGE,
  datedReference,
  idSchema,
  memberRefSchema,
  notReservedReference,
  paymentMethodSchema,
  paymentMethodsSchema,
  paymentMethodWord,
  type PaymentMethod,
} from './schemas';

export const ITEM_KINDS = ['uniform', 'book'] as const;
export const STOCK_STATES = ['in', 'low', 'out'] as const;
export const ITEM_NAME_MAX = 120;
export const ITEM_VARIANT_MAX = 40;
export const ITEM_LOW_STOCK_DEFAULT = 5;
export const STORE_SEARCH_MAX = 120;
export const DELIVERY_REFERENCE_MAX = 80;
export const DELIVERY_SUPPLIER_MAX = 120;
export const DELIVERY_QUANTITY_MAX = 100_000;
export const DELIVERY_LINES_MAX = 500;
export const UNIT_PRICE_MAX_MINOR = 100_000_000;
export const OPENING_STOCK_SUPPLIER = 'Opening stock count';

export const ITEM_REQUIRED_MESSAGE =
  'Enter a name, a cost price and a selling price.';
export const ITEM_PRICE_BELOW_COST_MESSAGE =
  'The selling price is below the cost price.';
export const BOOK_LEVEL_REQUIRED_MESSAGE = 'Choose a class level for a book.';
export const UNIFORM_NO_LEVEL_MESSAGE = 'A uniform has no class level.';
export const BOOK_NO_SIZE_MESSAGE = 'A book has no size.';
export const ITEM_RETIRED_EDIT_MESSAGE = 'A retired item can’t be edited.';
export const ITEM_NOT_FOUND_MESSAGE = 'Item not found';
export const ITEM_LEVEL_NOT_FOUND_MESSAGE = 'Class level not found';
export const itemDuplicateMessage = (displayName: string): string =>
  `${displayName} is already in the store.`;

export const DELIVERY_REQUIRED_MESSAGE =
  'Enter the supplier and at least one quantity.';
export const DELIVERY_REFERENCE_REQUIRED_MESSAGE =
  'Enter a reference. It makes a retried request apply at most once.';
export const DELIVERY_UNIT_COST_MESSAGE =
  'Enter a unit cost for every item you received.';
export const DELIVERY_QUANTITY_MAX_MESSAGE = `Receive ${DELIVERY_QUANTITY_MAX.toLocaleString('en-NG')} or fewer of an item at a time.`;
export const DELIVERY_LINES_MAX_MESSAGE = `List ${DELIVERY_LINES_MAX} items or fewer in one delivery.`;
export const UNIT_PRICE_MAX_MESSAGE = 'That price is too large.';
export const DELIVERY_FUTURE_DATE_MESSAGE =
  'The received date can’t be in the future.';
export const DELIVERY_ACCOUNT_MESSAGE =
  'Pay from an open money account on this campus or school-wide.';
export const DELIVERY_OPENING_ACCOUNT_MESSAGE =
  'Opening stock isn’t paid from a money account.';
export const DELIVERY_DUPLICATE_ITEM_MESSAGE = 'List each item once.';
export const DELIVERY_NOT_FOUND_MESSAGE = 'Delivery not found';
export const STORE_CAMPUS_NOT_FOUND_MESSAGE = 'Campus not found';
export const DELIVERY_REFERENCE_TAKEN_MESSAGE =
  'That reference is already used by another record.';
export const deliveryRetiredItemMessage = (displayName: string): string =>
  `${displayName} is retired.`;
export const openingStockRecordedMessage = (campusName: string): string =>
  `Opening stock is already recorded for ${campusName}.`;
export const deliveryReferenceUsedMessage = (
  reference: string,
  number: string
): string => `Reference ${reference} is already used by ${number}.`;

export const STOCK_COUNT_STATUSES = [
  'matched',
  'submitted',
  'approved',
  'rejected',
] as const;
export const STOCK_COUNT_NOTE_MAX = 500;

export const STOCK_COUNT_REQUIRED_MESSAGE = 'Count at least one item.';
export const STOCK_COUNT_NEGATIVE_MESSAGE =
  'Counted quantities are whole numbers from 0.';
export const STOCK_COUNT_QUANTITY_MAX_MESSAGE = `Count ${DELIVERY_QUANTITY_MAX.toLocaleString('en-NG')} or fewer of an item.`;
export const STOCK_COUNT_LINES_MAX_MESSAGE = `List ${DELIVERY_LINES_MAX} items or fewer in one count.`;
export const STOCK_COUNT_NOT_FOUND_MESSAGE = 'Stock count not found';
export const STOCK_MOVED_MESSAGE =
  'Stock has moved since this count. Count again.';
export const STOCK_COUNT_CLASH_MESSAGE =
  'Another count for this campus was submitted at the same time. Try again.';
export const stockCountWaitingMessage = (number: string): string =>
  `${number} for this campus is still waiting for approval. Approve or decline it first.`;
export const stockCountRetiredItemMessage = (displayName: string): string =>
  `${displayName} is retired and can’t be counted.`;

export const STORE_SALE_REQUIRED_MESSAGE =
  'Choose a student and at least one item.';
export const STORE_SALE_QUANTITY_MAX_MESSAGE = `Sell ${DELIVERY_QUANTITY_MAX.toLocaleString('en-NG')} or fewer of an item at a time.`;
export const STORE_SALE_LINES_MAX_MESSAGE = `List ${DELIVERY_LINES_MAX} items or fewer in one purchase.`;
export const STORE_SALE_POS_PROOF_MESSAGE =
  'Upload the POS slip before recording.';
export const STORE_SALE_TRANSFER_PROOF_MESSAGE =
  'Upload the transfer receipt before recording.';
export const STORE_SALE_NOT_ACTIVE_MESSAGE =
  'Only active students can receive items.';
export const STORE_SALE_NO_TERM_MESSAGE =
  'There is no current term. Set one before recording a purchase.';
export const STORE_SALE_REFERENCE_TAKEN_MESSAGE =
  'That reference is already used by another record.';
export const STORE_SALE_ZERO_PRICE_MESSAGE =
  'An item with no selling price can’t be sold.';
export const STORE_PAYMENT_VOID_MESSAGE =
  'This payment is for a store sale. It can’t be cancelled on its own.';
export const STORE_SALE_NOT_FOUND_MESSAGE = 'Sale not found';
export const STORE_SALE_ACCOUNT_CHOICE_MESSAGE =
  'Choose the money account that takes this payment.';
export const storeSaleReferenceUsedMessage = (
  reference: string,
  number: string
): string => `Reference ${reference} is already used by ${number}.`;
export const storeSaleStockShortMessage = (
  onHand: number,
  itemName: string,
  campusName: string
): string => `Only ${onHand} of ${itemName} left at ${campusName}.`;
export const storeSaleNoAccountMessage = (
  method: PaymentMethod,
  campusName: string
): string =>
  `No money account takes ${paymentMethodWord(method)} payments on ${campusName} campus.`;
export const storeSaleReplayedMessage = (
  reference: string,
  receiptNumber: string
): string =>
  `Reference ${reference} was already recorded as ${receiptNumber}. Nothing was posted twice.`;

export const storeSaleReference = (date: string, uuid: string): string =>
  datedReference('STORE', date, uuid);

const SALE_ACCOUNT_KINDS = {
  pos: ['pos'],
  transfer: ['bank'],
  cash: ['cash', 'bank'],
} as const satisfies Record<PaymentMethod, readonly MoneyAccountKind[]>;

export const saleAccountKinds = (
  method: PaymentMethod
): readonly MoneyAccountKind[] => SALE_ACCOUNT_KINDS[method];

export const SALE_METHOD_ORDER: readonly PaymentMethod[] = [
  'cash',
  'pos',
  'transfer',
];

export function fittingSaleAccounts<
  T extends {
    kind: MoneyAccountKind;
    campusId: string | null;
    retired?: boolean;
  },
>(method: PaymentMethod, campusId: string, accounts: readonly T[]): T[] {
  const kinds = saleAccountKinds(method);
  return accounts
    .filter(
      (account) =>
        account.retired !== true &&
        kinds.includes(account.kind) &&
        (account.campusId === null || account.campusId === campusId)
    )
    .toSorted((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
}

export const isSellable = (item: {
  retiredAt: string | null;
  sellPriceMinor: number;
}): boolean => item.retiredAt === null && item.sellPriceMinor > 0;

export const booksForLevel = <
  T extends { kind: ItemKind; classLevel: { id: string } | null },
>(
  items: readonly T[],
  levelId: string | null
): T[] =>
  items.filter(
    (item) =>
      item.kind === 'book' &&
      levelId !== null &&
      item.classLevel?.id === levelId
  );

export const itemKindSchema = z.enum(ITEM_KINDS);
export type ItemKind = z.infer<typeof itemKindSchema>;

export const stockStateSchema = z.enum(STOCK_STATES);
export type StockState = z.infer<typeof stockStateSchema>;

const minorSchema = z.number().int();
const countSchema = z.number().int().nonnegative();

export function itemDisplayName(item: {
  name: string;
  variant: string | null;
}): string {
  return item.variant === null ? item.name : `${item.name}, ${item.variant}`;
}

export function stockState(
  rows: readonly { onHand: number }[],
  lowLevel: number
): StockState {
  if (rows.every((row) => row.onHand <= 0)) {
    return 'out';
  }
  return rows.some((row) => row.onHand <= lowLevel) ? 'low' : 'in';
}

const requiredText = (max: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(max, `Use ${max} characters or fewer.`);

const priceSchema = z
  .number({ error: ITEM_REQUIRED_MESSAGE })
  .int(ITEM_REQUIRED_MESSAGE);

const sellPriceSchema = priceSchema
  .positive(ITEM_REQUIRED_MESSAGE)
  .max(UNIT_PRICE_MAX_MINOR, UNIT_PRICE_MAX_MESSAGE);
const costPriceSchema = priceSchema
  .nonnegative(ITEM_REQUIRED_MESSAGE)
  .max(UNIT_PRICE_MAX_MINOR, UNIT_PRICE_MAX_MESSAGE);

const lowLevelSchema = z
  .number({ error: ITEM_REQUIRED_MESSAGE })
  .int(ITEM_REQUIRED_MESSAGE)
  .nonnegative(ITEM_REQUIRED_MESSAGE);

const variantSchema = z
  .string()
  .trim()
  .max(ITEM_VARIANT_MAX, `Use ${ITEM_VARIANT_MAX} characters or fewer.`)
  .transform((value) => (value === '' ? null : value));

const createItemObjectSchema = z.object({
  kind: itemKindSchema,
  name: requiredText(ITEM_NAME_MAX, ITEM_REQUIRED_MESSAGE),
  variant: variantSchema.nullish().transform((value) => value ?? null),
  classLevelId: idSchema.nullish().transform((value) => value ?? null),
  costPriceMinor: costPriceSchema,
  sellPriceMinor: sellPriceSchema,
  lowStockLevel: lowLevelSchema.default(ITEM_LOW_STOCK_DEFAULT),
});

export const createItemSchema = createItemObjectSchema.superRefine(
  (body, context) => {
    if (body.kind === 'book' && body.classLevelId === null) {
      context.addIssue({
        code: 'custom',
        message: BOOK_LEVEL_REQUIRED_MESSAGE,
        path: ['classLevelId'],
      });
    }
    if (body.kind === 'uniform' && body.classLevelId !== null) {
      context.addIssue({
        code: 'custom',
        message: UNIFORM_NO_LEVEL_MESSAGE,
        path: ['classLevelId'],
      });
    }
    if (body.kind === 'book' && body.variant !== null) {
      context.addIssue({
        code: 'custom',
        message: BOOK_NO_SIZE_MESSAGE,
        path: ['variant'],
      });
    }
    if (body.sellPriceMinor < body.costPriceMinor) {
      context.addIssue({
        code: 'custom',
        message: ITEM_PRICE_BELOW_COST_MESSAGE,
        path: ['sellPriceMinor'],
      });
    }
  }
);
export type CreateItemInput = z.input<typeof createItemSchema>;
export type CreateItem = z.output<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    name: requiredText(ITEM_NAME_MAX, ITEM_REQUIRED_MESSAGE).optional(),
    variant: variantSchema.nullable().optional(),
    costPriceMinor: costPriceSchema.optional(),
    sellPriceMinor: sellPriceSchema.optional(),
    lowStockLevel: lowLevelSchema.optional(),
    retired: z.literal(true).optional(),
  })
  .superRefine((body, context) => {
    if (
      body.costPriceMinor !== undefined &&
      body.sellPriceMinor !== undefined &&
      body.sellPriceMinor < body.costPriceMinor
    ) {
      context.addIssue({
        code: 'custom',
        message: ITEM_PRICE_BELOW_COST_MESSAGE,
        path: ['sellPriceMinor'],
      });
    }
  });
export type UpdateItemInput = z.input<typeof updateItemSchema>;
export type UpdateItem = z.output<typeof updateItemSchema>;

const flagSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .default(false)
  .transform((value) => value === true || value === 'true');

export const itemListQuerySchema = z.object({
  campusId: idSchema.optional(),
  kind: itemKindSchema.optional(),
  q: z.string().trim().max(STORE_SEARCH_MAX).optional(),
  lowOnly: flagSchema,
  includeRetired: flagSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type ItemListQueryInput = z.input<typeof itemListQuerySchema>;
export type ItemListQuery = z.output<typeof itemListQuerySchema>;

export const stockRowSchema = z.object({
  campusId: idSchema,
  onHand: minorSchema,
  valueMinor: minorSchema,
  averageCostMinor: minorSchema.nonnegative(),
});
export type StockRow = z.infer<typeof stockRowSchema>;

export const itemSchema = z.object({
  id: idSchema,
  kind: itemKindSchema,
  name: z.string(),
  variant: z.string().nullable(),
  displayName: z.string(),
  classLevel: z.object({ id: idSchema, name: z.string() }).nullable(),
  costPriceMinor: minorSchema.nonnegative(),
  sellPriceMinor: minorSchema.positive(),
  lowStockLevel: countSchema,
  retiredAt: z.iso.datetime({ offset: true }).nullable(),
  stock: z.array(stockRowSchema),
  state: stockStateSchema,
});
export type Item = z.infer<typeof itemSchema>;

export const itemListSchema = z.object({
  items: z.array(itemSchema),
  total: countSchema,
});
export type ItemList = z.infer<typeof itemListSchema>;

export const deliveryLineInputSchema = z.object({
  itemId: idSchema,
  quantity: z
    .number({ error: DELIVERY_REQUIRED_MESSAGE })
    .int(DELIVERY_REQUIRED_MESSAGE)
    .positive(DELIVERY_REQUIRED_MESSAGE)
    .max(DELIVERY_QUANTITY_MAX, DELIVERY_QUANTITY_MAX_MESSAGE),
  unitCostMinor: z
    .number({ error: DELIVERY_UNIT_COST_MESSAGE })
    .int(DELIVERY_UNIT_COST_MESSAGE)
    .positive(DELIVERY_UNIT_COST_MESSAGE)
    .max(UNIT_PRICE_MAX_MINOR, UNIT_PRICE_MAX_MESSAGE),
});
export type DeliveryLineInput = z.infer<typeof deliveryLineInputSchema>;

export const recordDeliverySchema = z.object({
  reference: requiredText(
    DELIVERY_REFERENCE_MAX,
    DELIVERY_REFERENCE_REQUIRED_MESSAGE
  ),
  campusId: idSchema,
  supplierName: requiredText(DELIVERY_SUPPLIER_MAX, DELIVERY_REQUIRED_MESSAGE),
  moneyAccountId: idSchema.optional(),
  isOpening: z.boolean().optional(),
  receivedOn: z.iso.date().optional(),
  lines: z
    .array(deliveryLineInputSchema)
    .min(1, DELIVERY_REQUIRED_MESSAGE)
    .max(DELIVERY_LINES_MAX, DELIVERY_LINES_MAX_MESSAGE),
});
export type RecordDeliveryInput = z.input<typeof recordDeliverySchema>;
export type RecordDelivery = z.output<typeof recordDeliverySchema>;

const pagedQueryShape = {
  campusId: idSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
};

export const deliveryListQuerySchema = z.object(pagedQueryShape);
export type DeliveryListQueryInput = z.input<typeof deliveryListQuerySchema>;
export type DeliveryListQuery = z.output<typeof deliveryListQuerySchema>;

export const deliverySchema = z.object({
  id: idSchema,
  number: z.string(),
  reference: z.string(),
  campusId: idSchema,
  supplierName: z.string(),
  moneyAccount: z.object({ id: idSchema, name: z.string() }).nullable(),
  isOpening: z.boolean(),
  receivedOn: z.iso.date(),
  receivedBy: z.string().nullable(),
  totalMinor: minorSchema.positive(),
  itemCount: countSchema,
});
export type Delivery = z.infer<typeof deliverySchema>;

export const deliveryLineSchema = z.object({
  itemId: idSchema,
  itemName: z.string(),
  displayName: z.string(),
  retired: z.boolean(),
  quantity: z.number().int().positive(),
  unitCostMinor: minorSchema.positive(),
  totalMinor: minorSchema.positive(),
});
export type DeliveryLine = z.infer<typeof deliveryLineSchema>;

export const deliveryDetailSchema = deliverySchema.extend({
  lines: z.array(deliveryLineSchema),
});
export type DeliveryDetail = z.infer<typeof deliveryDetailSchema>;

export const deliveryListSchema = z.object({
  items: z.array(deliverySchema),
  total: countSchema,
  suppliers: z.array(z.string()),
});
export type DeliveryList = z.infer<typeof deliveryListSchema>;

export const recordedDeliverySchema = deliveryDetailSchema.extend({
  replayed: z.boolean(),
});
export type RecordedDelivery = z.infer<typeof recordedDeliverySchema>;

export const storeSummaryQuerySchema = z.object({
  campusId: idSchema.optional(),
});
export type StoreSummaryQuery = z.infer<typeof storeSummaryQuerySchema>;

export const storeTermFiguresSchema = z.object({
  termSalesMinor: minorSchema,
  termCostMinor: minorSchema,
  termSalesCount: countSchema,
  termItemsSold: countSchema,
  termStudentsServed: countSchema,
});
export type StoreTermFigures = z.infer<typeof storeTermFiguresSchema>;

export const storeSummarySchema = z.object({
  stockValueMinor: minorSchema,
  lowCount: countSchema,
  ...storeTermFiguresSchema.shape,
});
export type StoreSummary = z.infer<typeof storeSummarySchema>;

export const saleLineInputSchema = z.object({
  itemId: idSchema,
  quantity: z
    .number({ error: STORE_SALE_REQUIRED_MESSAGE })
    .int(STORE_SALE_REQUIRED_MESSAGE)
    .positive(STORE_SALE_REQUIRED_MESSAGE)
    .max(DELIVERY_QUANTITY_MAX, STORE_SALE_QUANTITY_MAX_MESSAGE),
});
export type SaleLineInput = z.infer<typeof saleLineInputSchema>;

export const recordSaleSchema = z
  .object({
    reference: requiredText(
      DELIVERY_REFERENCE_MAX,
      DELIVERY_REFERENCE_REQUIRED_MESSAGE
    ).refine(notReservedReference, RESERVED_REFERENCE_MESSAGE),
    studentId: idSchema,
    method: paymentMethodSchema,
    moneyAccountId: idSchema.optional(),
    proofFileId: idSchema.optional(),
    lines: z
      .array(saleLineInputSchema)
      .min(1, STORE_SALE_REQUIRED_MESSAGE)
      .max(DELIVERY_LINES_MAX, STORE_SALE_LINES_MAX_MESSAGE),
  })
  .superRefine((body, context) => {
    const ids = body.lines.map((line) => line.itemId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: DELIVERY_DUPLICATE_ITEM_MESSAGE,
        path: ['lines'],
      });
    }
  });
export type RecordSaleInput = z.input<typeof recordSaleSchema>;
export type RecordSale = z.output<typeof recordSaleSchema>;

export const saleListQuerySchema = z.object({
  campusId: idSchema.optional(),
  studentId: idSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type SaleListQueryInput = z.input<typeof saleListQuerySchema>;
export type SaleListQuery = z.output<typeof saleListQuerySchema>;

export const saleLineSchema = z.object({
  itemId: idSchema,
  displayName: z.string(),
  quantity: z.number().int().positive(),
  unitPriceMinor: minorSchema.positive(),
  amountMinor: minorSchema.positive(),
  costMinor: minorSchema.nonnegative(),
  unitCostMinor: minorSchema.nonnegative(),
});
export type SaleLine = z.infer<typeof saleLineSchema>;

export const saleSchema = z.object({
  id: idSchema,
  number: z.string(),
  reference: z.string(),
  soldOn: z.iso.date(),
  student: z.object({
    id: idSchema,
    name: z.string(),
    admissionNumber: z.string(),
    className: z.string().nullable(),
  }),
  campusId: idSchema,
  campusName: z.string(),
  soldBy: z.string().nullable(),
  lines: z.array(saleLineSchema),
  totalMinor: minorSchema.positive(),
  costMinor: minorSchema.nonnegative(),
  chargeId: idSchema,
  chargeNumber: z.string(),
  paymentId: idSchema,
  receiptNumber: z.string(),
  method: paymentMethodSchema,
  proof: z.object({ fileId: idSchema, fileName: z.string() }).nullable(),
});
export type Sale = z.infer<typeof saleSchema>;

export const recordedSaleSchema = saleSchema.extend({
  replayed: z.boolean(),
});
export type RecordedSale = z.infer<typeof recordedSaleSchema>;

export const saleListSchema = z.object({
  items: z.array(saleSchema),
  total: countSchema,
});
export type SaleList = z.infer<typeof saleListSchema>;

export const saleOptionsSchema = z.object({
  students: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      admissionNumber: z.string(),
      className: z.string().nullable(),
      levelId: idSchema.nullable(),
      levelName: z.string().nullable(),
      campusId: idSchema,
      campusName: z.string(),
      balanceMinor: minorSchema.optional(),
    })
  ),
  methods: paymentMethodsSchema,
  accounts: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      kind: moneyAccountKindSchema,
      campusId: idSchema.nullable(),
    })
  ),
});
export type SaleOptions = z.infer<typeof saleOptionsSchema>;

export const stockCountStatusSchema = z.enum(STOCK_COUNT_STATUSES);
export type StockCountStatus = z.infer<typeof stockCountStatusSchema>;

export const stockCountLineInputSchema = z.object({
  itemId: idSchema,
  countedQuantity: z
    .number({ error: STOCK_COUNT_NEGATIVE_MESSAGE })
    .int(STOCK_COUNT_NEGATIVE_MESSAGE)
    .nonnegative(STOCK_COUNT_NEGATIVE_MESSAGE)
    .max(DELIVERY_QUANTITY_MAX, STOCK_COUNT_QUANTITY_MAX_MESSAGE),
});
export type StockCountLineInput = z.infer<typeof stockCountLineInputSchema>;

export const submitStockCountSchema = z
  .object({
    campusId: idSchema,
    note: z
      .string()
      .trim()
      .max(
        STOCK_COUNT_NOTE_MAX,
        `Use ${STOCK_COUNT_NOTE_MAX} characters or fewer.`
      )
      .nullish()
      .transform((value) =>
        value === undefined || value === '' ? null : value
      ),
    lines: z
      .array(stockCountLineInputSchema)
      .min(1, STOCK_COUNT_REQUIRED_MESSAGE)
      .max(DELIVERY_LINES_MAX, STOCK_COUNT_LINES_MAX_MESSAGE),
  })
  .superRefine((body, context) => {
    const ids = body.lines.map((line) => line.itemId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: DELIVERY_DUPLICATE_ITEM_MESSAGE,
        path: ['lines'],
      });
    }
  });
export type SubmitStockCountInput = z.input<typeof submitStockCountSchema>;
export type SubmitStockCount = z.output<typeof submitStockCountSchema>;

export const stockCountListQuerySchema = z.object(pagedQueryShape);
export type StockCountListQueryInput = z.input<
  typeof stockCountListQuerySchema
>;
export type StockCountListQuery = z.output<typeof stockCountListQuerySchema>;

export const stockCountLineSchema = z.object({
  itemId: idSchema,
  displayName: z.string(),
  expectedQuantity: countSchema,
  countedQuantity: countSchema,
  difference: minorSchema,
  valueMinor: minorSchema.nonnegative(),
});
export type StockCountLine = z.infer<typeof stockCountLineSchema>;

export const stockCountSchema = z.object({
  id: idSchema,
  number: z.string(),
  campusId: idSchema,
  campusName: z.string(),
  status: stockCountStatusSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  countedBy: memberRefSchema,
  decidedBy: memberRefSchema.nullable(),
  rejectionReason: z.string().nullable(),
  netValueMinor: minorSchema,
  differences: z.string(),
  lines: z.array(stockCountLineSchema),
});
export type StockCount = z.infer<typeof stockCountSchema>;

export const stockCountListSchema = z.object({
  items: z.array(stockCountSchema),
  total: countSchema,
});
export type StockCountList = z.infer<typeof stockCountListSchema>;
