import { z } from 'zod';
import { currencySchema, idSchema, minorSchema } from './schemas';

export const MONEY_ACCOUNT_NAME_MAX = 80;
export const MONEY_ACCOUNT_KINDS = ['cash', 'bank', 'pos', 'gateway'] as const;
export const CREATABLE_MONEY_ACCOUNT_KINDS = ['bank', 'cash'] as const;
export const FEE_INCOME_SYSTEM_KEY = 'fee_income';
export const OTHER_CHARGES_SYSTEM_KEY = 'other_charges';
export const MONEY_ACCOUNTS_SYSTEM_KEY = 'money_accounts';
export const OPENING_BALANCE_SYSTEM_KEY = 'opening_balance_equity';
export const FEES_RECEIVABLE_SYSTEM_KEY = 'fees_receivable';
export const DISCOUNTS_GIVEN_SYSTEM_KEY = 'discounts_given';
export const STORE_STOCK_SYSTEM_KEY = 'store_stock';
export const STORE_LOSSES_SYSTEM_KEY = 'store_losses';
export const BAD_DEBT_SYSTEM_KEY = 'bad_debt';
export const STORE_SALES_SYSTEM_KEY = 'store_sales';
export const STORE_COST_SYSTEM_KEY = 'store_cost';
export const STUDENT_WALLETS_SYSTEM_KEY = 'student_wallets';
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
  'wallet_topup',
  'wallet_spend',
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
export const MONEY_ACCOUNT_GATEWAY_RETIRE_MESSAGE =
  'The Monnify collections account is built in and can’t be retired.';
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

export const TUITION_FEE_CODE = 4010;
export const FEE_LINE_NAME_MAX = 80;
export const FEE_APPLIES_TO = ['all', 'new', 'returning'] as const;
export const FEE_GROUPS = ['school', 'other'] as const;

export const FEE_LINE_AMOUNT_MESSAGE = 'Enter an amount.';
export const FEE_LINE_NAME_REQUIRED = 'Give the fee a name.';
export const FEE_LINE_NOT_FOUND_MESSAGE = 'Fee not found';
export const FEE_LINE_RETIRED_MESSAGE = 'This fee is retired. It can’t change.';
export const FEE_LINE_ALREADY_RETIRED_MESSAGE = 'This fee is already retired.';
export const FEE_TERM_ENDED_MESSAGE =
  "This term has ended. Fees for it can't change.";
export const FEE_EVERY_CAMPUS_MESSAGE =
  'Only someone who sees every campus can change a fee for every campus.';
export const FEE_TYPE_INVALID_MESSAGE =
  'Pick a fee type that sits under Fee income.';
export const FEE_TYPE_NOT_FOUND_MESSAGE = 'Fee type not found';
export const FEE_SESSION_NOT_FOUND_MESSAGE = 'School year not found';
export const FEE_TYPE_NAME_REQUIRED = 'Give the fee type a name.';
export const FEE_OPTION_NOT_OPTIONAL_MESSAGE =
  'This class level has no optional fee of that type.';
export const FEE_TERM_NOT_FOUND_MESSAGE = 'Term not found';
export const FEE_LEVEL_NOT_FOUND_MESSAGE = 'Class level not found';
export const FEE_PREVIEW_STUDENT_MESSAGE = 'Student not found for that term';
export const feeLineDuplicateMessage = (parts: {
  feeType: string;
  level: string;
  campus: string | null;
}): string => {
  const fee = /\bfee$/i.test(parts.feeType)
    ? parts.feeType
    : `${parts.feeType} fee`;
  return `There is already a ${fee} for ${parts.level} on ${parts.campus ?? 'every campus'} this term. Change its amount instead.`;
};
export const feeTypeDuplicateMessage = (name: string): string =>
  `A fee type called ${name} already exists.`;
export const FEE_COPY_NO_SOURCE_MESSAGE =
  'There is no earlier term to copy fees from.';
export const feeCopyEmptySourceMessage = (label: string): string =>
  `${label} has no fees to copy.`;
export const feeCopyTargetNotEmptyMessage = (label: string): string =>
  `${label} already has fees. Change them one at a time instead.`;
export const feeTermLabel = (term: {
  name: string;
  schoolYearName: string;
}): string => `${term.name}, ${term.schoolYearName}`;

export const feeAppliesToSchema = z.enum(FEE_APPLIES_TO);
export type FeeAppliesTo = z.infer<typeof feeAppliesToSchema>;

export const feeGroupSchema = z.enum(FEE_GROUPS);
export type FeeGroup = z.infer<typeof feeGroupSchema>;

export const feeTypeSchema = z.object({
  id: idSchema,
  code: z.number().int().positive(),
  name: z.string(),
});
export type FeeType = z.infer<typeof feeTypeSchema>;

export const createFeeTypeSchema = z.object({
  name: nameOf(FEE_TYPE_NAME_REQUIRED),
});
export type CreateFeeTypeInput = z.input<typeof createFeeTypeSchema>;

const feeAmountSchema = z
  .number({ error: FEE_LINE_AMOUNT_MESSAGE })
  .int(FEE_LINE_AMOUNT_MESSAGE)
  .positive(FEE_LINE_AMOUNT_MESSAGE);

export const feeLineSchema = z.object({
  id: idSchema,
  termId: idSchema,
  classLevelId: idSchema,
  levelName: z.string(),
  levelSequence: z.number().int().positive(),
  feeTypeId: idSchema,
  feeTypeCode: z.number().int().positive(),
  feeTypeName: z.string(),
  campusId: idSchema.nullable(),
  campusName: z.string().nullable(),
  name: z.string(),
  amountMinor: minorSchema.positive(),
  appliesTo: feeAppliesToSchema,
  isOptional: z.boolean(),
  retiredAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type FeeLine = z.infer<typeof feeLineSchema>;

const queryFlagSchema = z.union([z.boolean(), z.stringbool()]);

export const feeLineListQuerySchema = z.object({
  termId: idSchema,
  group: feeGroupSchema.optional(),
  feeTypeId: idSchema.optional(),
  includeRetired: queryFlagSchema.default(true),
});
export type FeeLineListQuery = z.output<typeof feeLineListQuerySchema>;

export const feeSetupTermSchema = z.object({
  id: idSchema,
  name: z.string(),
  schoolYearName: z.string(),
  isCurrent: z.boolean(),
});
export type FeeSetupTerm = z.infer<typeof feeSetupTermSchema>;

export const feeSetupLevelSchema = z.object({
  id: idSchema,
  name: z.string(),
  sequence: z.number().int().positive(),
});
export type FeeSetupLevel = z.infer<typeof feeSetupLevelSchema>;

export const feeSetupSchema = z.object({
  terms: z.array(feeSetupTermSchema),
  levels: z.array(feeSetupLevelSchema),
});
export type FeeSetup = z.infer<typeof feeSetupSchema>;

export const feeGridQuerySchema = z.object({
  termId: idSchema,
  group: feeGroupSchema,
  feeTypeId: idSchema.optional(),
});
export type FeeGridQuery = z.output<typeof feeGridQuerySchema>;

export const feeGridAmountSchema = z.object({
  feeLineId: idSchema,
  amountMinor: minorSchema.positive(),
  appliesTo: feeAppliesToSchema,
  isOptional: z.boolean(),
});
export type FeeGridAmount = z.infer<typeof feeGridAmountSchema>;

export const feeGridOverrideSchema = feeGridAmountSchema.extend({
  campusId: idSchema,
  campusName: z.string(),
});
export type FeeGridOverride = z.infer<typeof feeGridOverrideSchema>;

export const feeGridCellSchema = z.object({
  feeTypeId: idSchema,
  base: feeGridAmountSchema.nullable(),
  overrides: z.array(feeGridOverrideSchema),
});
export type FeeGridCell = z.infer<typeof feeGridCellSchema>;

export const feeGridRowSchema = z.object({
  level: z.object({
    id: idSchema,
    name: z.string(),
    sequence: z.number().int().positive(),
  }),
  cells: z.array(feeGridCellSchema),
  typicalTotalMinor: minorSchema.nonnegative().nullable(),
});
export type FeeGridRow = z.infer<typeof feeGridRowSchema>;

export const feeGridSchema = z.object({
  currency: currencySchema,
  feeTypes: z.array(feeTypeSchema),
  rows: z.array(feeGridRowSchema),
});
export type FeeGrid = z.infer<typeof feeGridSchema>;

export const createFeeLineSchema = z.object({
  termId: idSchema,
  classLevelId: idSchema,
  feeTypeId: idSchema,
  campusId: idSchema.nullable(),
  name: z
    .string({ error: FEE_LINE_NAME_REQUIRED })
    .trim()
    .min(1, FEE_LINE_NAME_REQUIRED)
    .max(FEE_LINE_NAME_MAX, `Use ${FEE_LINE_NAME_MAX} characters or fewer.`),
  amountMinor: feeAmountSchema,
  appliesTo: feeAppliesToSchema.default('all'),
  isOptional: z.boolean().default(false),
});
export type CreateFeeLineInput = z.input<typeof createFeeLineSchema>;

export const updateFeeLineSchema = z.strictObject({
  amountMinor: feeAmountSchema,
});
export type UpdateFeeLineInput = z.input<typeof updateFeeLineSchema>;

export const feeCopyQuerySchema = z.object({ termId: idSchema });
export type FeeCopyQuery = z.output<typeof feeCopyQuerySchema>;

export const copyFeeLinesSchema = z.strictObject({ termId: idSchema });
export type CopyFeeLinesInput = z.input<typeof copyFeeLinesSchema>;

export const feeCopyTermSchema = z.object({
  id: idSchema,
  name: z.string(),
  schoolYearName: z.string(),
});
export type FeeCopyTerm = z.infer<typeof feeCopyTermSchema>;

export const feeCopySourceSchema = z.object({
  sourceTerm: feeCopyTermSchema.nullable(),
  liveLineCount: z.number().int().nonnegative(),
  targetHasLines: z.boolean(),
});
export type FeeCopySource = z.infer<typeof feeCopySourceSchema>;

export const feeCopyResultSchema = z.object({
  copied: z.number().int().positive(),
  sourceTerm: feeCopyTermSchema,
});
export type FeeCopyResult = z.infer<typeof feeCopyResultSchema>;

export const feePreviewQuerySchema = z.object({
  termId: idSchema,
  studentId: idSchema,
});
export type FeePreviewQuery = z.output<typeof feePreviewQuerySchema>;

export const FEE_CANDIDATE_LIMIT = 100;

export const feeCandidatesQuerySchema = z.object({
  termId: idSchema,
  q: z.string().trim().max(120).optional(),
});
export type FeeCandidatesQuery = z.output<typeof feeCandidatesQuerySchema>;

export const feeCandidateSchema = z.object({
  id: idSchema,
  name: z.string(),
  admissionNumber: z.string(),
  levelName: z.string(),
});
export type FeeCandidate = z.infer<typeof feeCandidateSchema>;

export const feeCandidatesSchema = z.object({
  items: z.array(feeCandidateSchema),
  total: z.number().int().nonnegative(),
});
export type FeeCandidates = z.infer<typeof feeCandidatesSchema>;

export const feePreviewLineSchema = z.object({
  feeLineId: idSchema.nullable(),
  description: z.string(),
  feeTypeName: z.string(),
  amountMinor: minorSchema,
  optedIn: z.boolean(),
  campusName: z.string().nullable(),
});
export type FeePreviewLine = z.infer<typeof feePreviewLineSchema>;

export const feePreviewSchema = z.object({
  currency: currencySchema,
  student: z.object({
    id: idSchema,
    name: z.string(),
    armName: z.string().nullable(),
    levelName: z.string(),
    campusId: idSchema,
    campusName: z.string(),
    isNew: z.boolean(),
  }),
  charged: z
    .object({
      status: z.enum(['draft', 'sent']),
      number: z.string().nullable(),
    })
    .nullable()
    .optional(),
  lines: z.array(feePreviewLineSchema),
  totalMinor: minorSchema,
  pendingDiscounts: z.array(z.string()),
});
export type FeePreview = z.infer<typeof feePreviewSchema>;

export const feeOptionParamsSchema = z.object({
  studentId: idSchema,
  feeTypeId: idSchema,
});

export const feeOptionsParamsSchema = z.object({ studentId: idSchema });

export const feeOptionsQuerySchema = z.object({
  sessionId: idSchema.optional(),
});

export const feeOptionSchema = z.object({
  feeTypeId: idSchema,
  name: z.string(),
  optedIn: z.boolean(),
});
export type FeeOption = z.infer<typeof feeOptionSchema>;

export const setFeeOptionSchema = z.object({
  optedIn: z.boolean(),
  sessionId: idSchema.optional(),
});
export type SetFeeOptionInput = z.input<typeof setFeeOptionSchema>;

export const feeOptionResultSchema = z.object({
  feeTypeId: idSchema,
  optedIn: z.boolean(),
});
export type FeeOptionResult = z.infer<typeof feeOptionResultSchema>;

export const FEE_OPT_IN_LIMIT = 200;

export const feeOptInParamsSchema = z.object({ feeTypeId: idSchema });

export const feeOptInsQuerySchema = z.object({
  termId: idSchema,
  q: z.string().trim().max(120).optional(),
});
export type FeeOptInsQuery = z.output<typeof feeOptInsQuerySchema>;

export const feeOptInRowSchema = z.object({
  studentId: idSchema,
  name: z.string(),
  admissionNumber: z.string(),
  levelName: z.string(),
  campusName: z.string(),
  optedIn: z.boolean(),
});
export type FeeOptInRow = z.infer<typeof feeOptInRowSchema>;

export const feeOptInsSchema = z.object({
  schoolYearName: z.string(),
  items: z.array(feeOptInRowSchema),
  total: z.number().int().nonnegative(),
});
export type FeeOptIns = z.infer<typeof feeOptInsSchema>;

export const setFeeOptInsSchema = z.object({
  termId: idSchema,
  studentIds: z
    .array(idSchema)
    .min(1)
    .max(FEE_OPT_IN_LIMIT)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Each student can be listed once.',
    }),
  optedIn: z.boolean(),
});
export type SetFeeOptInsInput = z.input<typeof setFeeOptInsSchema>;

export const feeOptInsResultSchema = z.object({
  feeTypeId: idSchema,
  optedIn: z.boolean(),
  changed: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
});
export type FeeOptInsResult = z.infer<typeof feeOptInsResultSchema>;
