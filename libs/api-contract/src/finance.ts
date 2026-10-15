import { z } from 'zod';
import { currencySchema, idSchema } from './schemas';

export const MONEY_ACCOUNT_NAME_MAX = 80;
export const MONEY_ACCOUNT_KINDS = ['cash', 'bank', 'pos', 'gateway'] as const;
export const CREATABLE_MONEY_ACCOUNT_KINDS = ['bank', 'pos', 'cash'] as const;
export const LEDGER_ACCOUNT_TYPES = [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
] as const;
export const JOURNAL_KINDS = [
  'invoice',
  'adhoc',
  'payment',
  'payment_void',
  'adjustment',
  'opening',
  'store',
  'store_receive',
  'store_cost',
  'store_count',
] as const;
export const FINANCE_PAGE_SIZE = 10;
export const FINANCE_PAGE_SIZE_MAX = 50;

export const MONEY_ACCOUNT_NAME_REQUIRED = 'Give the account a name.';
export const MONEY_ACCOUNT_LAST4_MESSAGE =
  'Enter the last 4 digits, or leave it blank.';
export const MONEY_ACCOUNT_NOT_FOUND_MESSAGE = 'Money account not found';
export const MONEY_ACCOUNT_SCHOOL_WIDE_MESSAGE =
  'Only someone who sees every campus can add a school-wide account.';
export const MONEY_ACCOUNT_BANK_NAME_MESSAGE =
  'A bank name belongs only on a bank account.';
export const MONEY_ACCOUNT_RETIRE_MESSAGE =
  'A retired account can’t be brought back.';
export const moneyAccountDuplicateMessage = (name: string): string =>
  `An account called ${name} already exists.`;

export const LEDGER_ACCOUNT_NAME_REQUIRED = 'Give the category a name.';
export const LEDGER_ACCOUNT_NOT_FOUND_MESSAGE = 'Category not found';
export const LEDGER_ACCOUNT_PARENT_MESSAGE =
  'New categories can only go under Fee income.';
export const ledgerAccountDuplicateMessage = (name: string): string =>
  `A category called ${name} already exists here.`;
export const LEDGER_CODE_TAKEN_MESSAGE =
  'Another category was added at the same moment. Try again.';

export const JOURNAL_RANGE_MESSAGE =
  'The From date can’t be after the To date.';
export const OPENING_AMOUNT_MESSAGE = 'Enter an amount above zero.';
export const OPENING_EMPTY_MESSAGE = 'Add at least one opening balance.';

export const moneyAccountKindSchema = z.enum(MONEY_ACCOUNT_KINDS);
export type MoneyAccountKind = z.infer<typeof moneyAccountKindSchema>;

export const ledgerAccountTypeSchema = z.enum(LEDGER_ACCOUNT_TYPES);
export type LedgerAccountType = z.infer<typeof ledgerAccountTypeSchema>;

export const journalKindSchema = z.enum(JOURNAL_KINDS);
export type JournalKind = z.infer<typeof journalKindSchema>;

const minorSchema = z.number().int();
const nameOf = (required: string) =>
  z.string().trim().min(1, required).max(MONEY_ACCOUNT_NAME_MAX);
const last4Schema = z.string().regex(/^\d{4}$/, MONEY_ACCOUNT_LAST4_MESSAGE);
const bankNameSchema = z.string().trim().min(1).max(MONEY_ACCOUNT_NAME_MAX);

export const moneyAccountSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: moneyAccountKindSchema,
  campusId: idSchema.nullable(),
  campusName: z.string().nullable(),
  bankName: z.string().nullable(),
  last4: z.string().nullable(),
  ledgerAccountId: idSchema,
  ledgerCode: z.number().int().positive(),
  balanceMinor: minorSchema,
  retiredAt: z.iso.datetime({ offset: true }).nullable(),
});
export type MoneyAccount = z.infer<typeof moneyAccountSchema>;

export const moneyAccountListSchema = z.object({
  currency: currencySchema,
  items: z.array(moneyAccountSchema),
  hiddenSchoolWideCount: z.number().int().nonnegative(),
});
export type MoneyAccountList = z.infer<typeof moneyAccountListSchema>;

export const cashBookQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type CashBookQuery = z.output<typeof cashBookQuerySchema>;

export const referenceLinkSchema = z
  .object({ type: z.enum(['invoice', 'payment']), id: idSchema })
  .nullable();
export type ReferenceLink = z.infer<typeof referenceLinkSchema>;

export const cashBookItemSchema = z.object({
  entryId: idSchema,
  effectiveOn: z.iso.date(),
  reference: z.string(),
  kind: journalKindSchema,
  memo: z.string().nullable(),
  link: referenceLinkSchema,
  inMinor: minorSchema.nonnegative(),
  outMinor: minorSchema.nonnegative(),
  runningBalanceMinor: minorSchema,
});
export type CashBookItem = z.infer<typeof cashBookItemSchema>;

export const cashBookSchema = z.object({
  currency: currencySchema,
  account: moneyAccountSchema,
  items: z.array(cashBookItemSchema),
  total: z.number().int().nonnegative(),
});
export type CashBook = z.infer<typeof cashBookSchema>;

export const createMoneyAccountSchema = z.object({
  name: nameOf(MONEY_ACCOUNT_NAME_REQUIRED),
  kind: z.enum(CREATABLE_MONEY_ACCOUNT_KINDS),
  bankName: bankNameSchema.optional(),
  last4: last4Schema.optional(),
  campusId: idSchema.nullable(),
});
export type CreateMoneyAccountInput = z.input<typeof createMoneyAccountSchema>;

export const updateMoneyAccountSchema = z.strictObject({
  name: nameOf(MONEY_ACCOUNT_NAME_REQUIRED).optional(),
  bankName: bankNameSchema.optional(),
  last4: last4Schema.nullable().optional(),
  retired: z.boolean().optional(),
});
export type UpdateMoneyAccountInput = z.input<typeof updateMoneyAccountSchema>;

export const ledgerAccountSchema = z.object({
  id: idSchema,
  code: z.number().int().positive(),
  name: z.string(),
  type: ledgerAccountTypeSchema,
  parentId: idSchema.nullable(),
  systemKey: z.string().nullable(),
  balanceMinor: minorSchema,
});
export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;

export const ledgerAccountListSchema = z.object({
  currency: currencySchema,
  scoped: z.boolean(),
  items: z.array(ledgerAccountSchema),
});
export type LedgerAccountList = z.infer<typeof ledgerAccountListSchema>;

export const createLedgerAccountSchema = z.object({
  parentId: idSchema,
  name: nameOf(LEDGER_ACCOUNT_NAME_REQUIRED),
});
export type CreateLedgerAccountInput = z.input<
  typeof createLedgerAccountSchema
>;

export const journalQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    kind: journalKindSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(FINANCE_PAGE_SIZE_MAX)
      .default(FINANCE_PAGE_SIZE),
  })
  .refine(
    (query) =>
      query.from === undefined ||
      query.to === undefined ||
      query.from <= query.to,
    { message: JOURNAL_RANGE_MESSAGE, path: ['from'] }
  );
export type JournalQuery = z.output<typeof journalQuerySchema>;

export const journalLineSchema = z.object({
  accountCode: z.number().int().positive(),
  accountName: z.string(),
  studentName: z.string().nullable(),
  campusName: z.string().nullable(),
  debitMinor: minorSchema.nonnegative(),
  creditMinor: minorSchema.nonnegative(),
});
export type JournalLine = z.infer<typeof journalLineSchema>;

export const journalEntrySchema = z.object({
  entryId: idSchema,
  effectiveOn: z.iso.date(),
  reference: z.string(),
  kind: journalKindSchema,
  memo: z.string().nullable(),
  totalMinor: minorSchema.nonnegative(),
  link: referenceLinkSchema,
  lines: z.array(journalLineSchema),
});
export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const journalListSchema = z.object({
  currency: currencySchema,
  items: z.array(journalEntrySchema),
  total: z.number().int().nonnegative(),
});
export type JournalList = z.infer<typeof journalListSchema>;

const amountSchema = z.number().int().positive(OPENING_AMOUNT_MESSAGE);

export const openingStudentItemSchema = z.object({
  studentId: idSchema,
  amountMinor: amountSchema,
  direction: z.enum(['debt', 'credit']),
  memo: z.string().trim().max(500).optional(),
  effectiveOn: z.iso.date(),
});
export type OpeningStudentItem = z.infer<typeof openingStudentItemSchema>;

export const openingMoneyAccountItemSchema = z.object({
  moneyAccountId: idSchema,
  amountMinor: amountSchema,
  effectiveOn: z.iso.date(),
});
export type OpeningMoneyAccountItem = z.infer<
  typeof openingMoneyAccountItemSchema
>;

export const openingBalancesSchema = z
  .object({
    items: z.array(openingStudentItemSchema).default([]),
    moneyAccounts: z.array(openingMoneyAccountItemSchema).default([]),
  })
  .refine((body) => body.items.length + body.moneyAccounts.length > 0, {
    message: OPENING_EMPTY_MESSAGE,
    path: ['items'],
  });
export type OpeningBalancesInput = z.input<typeof openingBalancesSchema>;
export type OpeningBalances = z.output<typeof openingBalancesSchema>;

export const openingBalancesResultSchema = z.object({
  posted: z.number().int().nonnegative(),
  skipped: z.array(
    z.object({
      studentId: idSchema.optional(),
      moneyAccountId: idSchema.optional(),
      reason: z.literal('already_posted'),
    })
  ),
});
export type OpeningBalancesResult = z.infer<typeof openingBalancesResultSchema>;
