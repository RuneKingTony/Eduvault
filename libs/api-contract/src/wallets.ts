import { naira } from '@eduvault/shared';
import { z } from 'zod';
import {
  FINANCE_PAGE_SIZE,
  FINANCE_PAGE_SIZE_MAX,
  journalKindSchema,
  moneyAccountKindSchema,
} from './finance';
import { paymentReferenceSchema } from './payments';
import {
  currencySchema,
  idSchema,
  minorSchema,
  paymentMethodSchema,
  paymentMethodsSchema,
} from './schemas';

export const WALLET_SEARCH_MAX = 120;
export const WALLET_DEPOSITOR_NAME_MAX = 120;

export const WALLET_NOT_FOUND_MESSAGE = 'Wallet not found';
export const WALLET_STUDENT_NOT_FOUND_MESSAGE = 'Student not found';
export const WALLET_ACCOUNT_NOT_FOUND_MESSAGE = 'Money account not found';
export const WALLET_ACCOUNT_RETIRED_MESSAGE =
  'That account is retired. Choose another one.';
export const WALLET_ACCOUNT_GATEWAY_MESSAGE =
  'Online payments reach the wallet by themselves. Choose a cash, bank or POS account.';
export const WALLET_ACCOUNT_METHOD_MESSAGE =
  'A bank transfer goes into a bank account, and POS into a POS or bank account.';
export const WALLET_METHOD_OFF_MESSAGE =
  'That way of paying is switched off in Payment rules.';
export const WALLET_NOT_PAYING_MESSAGE =
  'This guardian doesn’t pay fees for any child, so money can’t be added to the wallet.';
export const WALLET_AMOUNT_MESSAGE = 'Enter an amount above zero.';
export const WALLET_FUTURE_DATE_MESSAGE = 'Received on can’t be after today.';
export const WALLET_REFERENCE_TAKEN_MESSAGE =
  'That reference is already used by another record.';
export const WALLET_PROOF_REQUIRED_MESSAGE =
  'Add the receipt (a photo, screenshot or PDF) before recording.';
export const WALLET_PROOF_DENIED_MESSAGE =
  'You need permission to record wallet top-ups.';
export const WALLET_PROOF_NOT_FOUND_MESSAGE = 'Receipt not found';
export const WALLET_PROOF_TAKEN_MESSAGE =
  'That receipt is already attached to another top-up.';
export const WALLET_PROOF_LOCKED_MESSAGE =
  'A top-up receipt is kept with its top-up and can’t be removed.';
export const WALLET_SPEND_NO_LINES_MESSAGE =
  'Choose at least one child to pay for.';
export const WALLET_SPEND_TWICE_MESSAGE =
  'A child can appear only once in the list.';
export const WALLET_EARMARK_RELEASE_OVER_MESSAGE =
  'That is more than is set aside for this child.';
export const WALLET_EARMARK_SET_OVER_MESSAGE =
  'That is more than is free to use in the wallet.';

export const walletSpendOverMessage = (
  childName: string,
  spendableMinor: number
): string =>
  spendableMinor > 0
    ? `${childName}’s charges can take up to ${naira(spendableMinor)} from the wallet.`
    : `Nothing in the wallet can be used for ${childName}’s charges right now.`;
export const walletEarmarkSetOverMessage = (freeMinor: number): string =>
  `${WALLET_EARMARK_SET_OVER_MESSAGE} You can set aside up to ${naira(Math.max(0, freeMinor))}.`;
export const walletEarmarkReleaseOverMessage = (earmarkMinor: number): string =>
  `${WALLET_EARMARK_RELEASE_OVER_MESSAGE} You can release up to ${naira(earmarkMinor)}.`;

const countSchema = z.number().int().nonnegative();
const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(FINANCE_PAGE_SIZE_MAX)
  .default(FINANCE_PAGE_SIZE);

const amountSchema = z
  .number({ error: WALLET_AMOUNT_MESSAGE })
  .int(WALLET_AMOUNT_MESSAGE)
  .positive(WALLET_AMOUNT_MESSAGE);

export const walletParamsSchema = z.object({ walletId: idSchema });
export type WalletParams = z.output<typeof walletParamsSchema>;

export const walletListQuerySchema = z.object({
  q: z.string().trim().max(WALLET_SEARCH_MAX).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});
export type WalletListQuery = z.output<typeof walletListQuerySchema>;

export const walletSummarySchema = z.object({
  id: idSchema,
  guardianId: idSchema,
  guardianName: z.string(),
  guardianPhone: z.string(),
  childCount: countSchema,
  balanceMinor: minorSchema,
  setAsideMinor: minorSchema,
  freeMinor: minorSchema,
});
export type WalletSummary = z.infer<typeof walletSummarySchema>;

export const walletListTotalsSchema = z.object({
  walletCount: countSchema,
  balanceMinor: minorSchema,
  setAsideMinor: minorSchema,
  freeMinor: minorSchema,
});
export type WalletListTotals = z.infer<typeof walletListTotalsSchema>;

export const walletListSchema = z.object({
  currency: currencySchema,
  items: z.array(walletSummarySchema),
  total: countSchema,
  totals: walletListTotalsSchema,
});
export type WalletList = z.infer<typeof walletListSchema>;

export const walletChildSchema = z.object({
  studentId: idSchema,
  name: z.string(),
  admissionNumber: z.string(),
  inScope: z.boolean(),
  owedMinor: minorSchema,
  earmarkMinor: minorSchema.nonnegative(),
  spendableMinor: minorSchema.nonnegative(),
  oldestUnpaidOn: z.iso.date().nullable(),
});
export type WalletChild = z.infer<typeof walletChildSchema>;

export const reservedAccountSchema = z.object({
  accountNumber: z.string(),
  bankName: z.string(),
  accountName: z.string(),
});
export type ReservedAccount = z.infer<typeof reservedAccountSchema>;

export const walletSchema = z.object({
  currency: currencySchema,
  id: idSchema,
  guardian: z.object({
    id: idSchema,
    name: z.string(),
    phone: z.string(),
  }),
  reservedAccount: reservedAccountSchema.nullable(),
  gatewayConnected: z.boolean(),
  autoPay: z.boolean(),
  balanceMinor: minorSchema,
  setAsideMinor: minorSchema,
  freeMinor: minorSchema,
  children: z.array(walletChildSchema),
});
export type Wallet = z.infer<typeof walletSchema>;

export const walletMovementQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
});
export type WalletMovementQuery = z.output<typeof walletMovementQuerySchema>;

export const walletMovementSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('topup'),
    id: idSchema,
    method: paymentMethodSchema,
    depositorName: z.string().nullable(),
    proofFileId: idSchema,
  }),
  z.object({
    type: z.literal('monnify'),
    id: idSchema,
    transactionReference: z.string(),
    paymentReference: z.string(),
    signatureVerified: z.literal(true),
    paidAt: z.iso.datetime({ offset: true }),
    confirmedAt: z.iso.datetime({ offset: true }),
    grossMinor: minorSchema.positive(),
    feeMinor: minorSchema.nonnegative(),
    netMinor: minorSchema.positive(),
  }),
  z.object({ type: z.literal('spend'), id: idSchema }),
]);
export type WalletMovementSource = z.infer<typeof walletMovementSourceSchema>;

export const walletMovementSchema = z.object({
  lineId: idSchema,
  entryId: idSchema,
  effectiveOn: z.iso.date(),
  postedAt: z.iso.datetime({ offset: true }),
  kind: journalKindSchema,
  reference: z.string(),
  studentId: idSchema.nullable(),
  studentName: z.string().nullable(),
  amountMinor: minorSchema,
  source: walletMovementSourceSchema.nullable(),
  madeBy: z.string().nullable(),
});
export type WalletMovement = z.infer<typeof walletMovementSchema>;

export const walletMovementListSchema = z.object({
  currency: currencySchema,
  items: z.array(walletMovementSchema),
  total: countSchema,
});
export type WalletMovementList = z.infer<typeof walletMovementListSchema>;

export const portalWalletMovementSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('topup'),
    method: paymentMethodSchema,
    depositorName: z.string().nullable(),
  }),
  z.object({
    type: z.literal('monnify'),
    transactionReference: z.string(),
    paymentReference: z.string(),
    signatureVerified: z.literal(true),
    paidAt: z.iso.datetime({ offset: true }),
    confirmedAt: z.iso.datetime({ offset: true }),
    grossMinor: minorSchema.positive(),
    feeMinor: minorSchema.nonnegative(),
    netMinor: minorSchema.positive(),
  }),
  z.object({ type: z.literal('spend'), automatic: z.boolean() }),
]);
export type PortalWalletMovementSource = z.infer<
  typeof portalWalletMovementSourceSchema
>;

export const portalWalletMovementSchema = z.object({
  id: idSchema,
  effectiveOn: z.iso.date(),
  postedAt: z.iso.datetime({ offset: true }),
  kind: journalKindSchema,
  reference: z.string(),
  studentId: idSchema.nullable(),
  studentName: z.string().nullable(),
  amountMinor: minorSchema,
  source: portalWalletMovementSourceSchema.nullable(),
});
export type PortalWalletMovement = z.infer<typeof portalWalletMovementSchema>;

export const portalWalletMovementListSchema = z.object({
  currency: currencySchema,
  items: z.array(portalWalletMovementSchema),
  total: countSchema,
});
export type PortalWalletMovementList = z.infer<
  typeof portalWalletMovementListSchema
>;

export const topUpOptionsSchema = z.object({
  currency: currencySchema,
  today: z.iso.date(),
  accounts: z.array(
    z.object({
      id: idSchema,
      label: z.string(),
      kind: moneyAccountKindSchema,
    })
  ),
  methods: paymentMethodsSchema,
});
export type TopUpOptions = z.infer<typeof topUpOptionsSchema>;

export const topUpWalletSchema = z.object({
  reference: paymentReferenceSchema,
  moneyAccountId: idSchema,
  method: paymentMethodSchema,
  amountMinor: amountSchema,
  receivedOn: z.iso.date(),
  depositorName: z
    .string()
    .trim()
    .max(
      WALLET_DEPOSITOR_NAME_MAX,
      `Use ${WALLET_DEPOSITOR_NAME_MAX} characters or fewer.`
    )
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  proofFileId: idSchema,
});
export type TopUpWalletInput = z.input<typeof topUpWalletSchema>;
export type TopUpWallet = z.output<typeof topUpWalletSchema>;

export const toppedUpWalletSchema = z.object({
  id: idSchema,
  reference: z.string(),
  amountMinor: minorSchema.positive(),
  method: paymentMethodSchema,
  receivedOn: z.iso.date(),
  replayed: z.boolean(),
  wallet: walletSchema,
});
export type ToppedUpWallet = z.infer<typeof toppedUpWalletSchema>;

export const spendLineSchema = z.object({
  studentId: idSchema,
  amountMinor: amountSchema,
});
export type SpendLine = z.infer<typeof spendLineSchema>;

export const spendWalletSchema = z
  .object({
    reference: paymentReferenceSchema,
    lines: z.array(spendLineSchema).min(1, WALLET_SPEND_NO_LINES_MESSAGE),
  })
  .superRefine((body, context) => {
    const students = body.lines.map((line) => line.studentId);
    if (new Set(students).size !== students.length) {
      context.addIssue({
        code: 'custom',
        message: WALLET_SPEND_TWICE_MESSAGE,
        path: ['lines'],
      });
    }
  });
export type SpendWalletInput = z.input<typeof spendWalletSchema>;
export type SpendWallet = z.output<typeof spendWalletSchema>;

export const spentWalletSchema = z.object({
  id: idSchema,
  reference: z.string(),
  totalMinor: minorSchema.positive(),
  lines: z.array(spendLineSchema),
  replayed: z.boolean(),
  wallet: walletSchema,
});
export type SpentWallet = z.infer<typeof spentWalletSchema>;

export const earmarkSchema = z.object({
  reference: paymentReferenceSchema,
  studentId: idSchema,
  amountMinor: amountSchema,
});
export type EarmarkInput = z.input<typeof earmarkSchema>;
export type Earmark = z.output<typeof earmarkSchema>;

export const earmarkedWalletSchema = z.object({
  replayed: z.boolean(),
  wallet: walletSchema,
});
export type EarmarkedWallet = z.infer<typeof earmarkedWalletSchema>;

export const setAutoPaySchema = z.object({
  enabled: z.boolean(),
  reference: paymentReferenceSchema,
});
export type SetAutoPayInput = z.input<typeof setAutoPaySchema>;
export type SetAutoPay = z.output<typeof setAutoPaySchema>;

export { PAYMENT_PROOF as WALLET_PROOF } from './payments';
