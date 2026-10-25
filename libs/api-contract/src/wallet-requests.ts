import { naira } from '@eduvault/shared';
import { z } from 'zod';
import {
  APPROVAL_REASON_MAX,
  approvalStatusSchema,
  walletApprovalKindSchema,
} from './approvals';
import {
  FINANCE_PAGE_SIZE,
  FINANCE_PAGE_SIZE_MAX,
  moneyAccountKindSchema,
} from './finance';
import { paymentReferenceSchema } from './payments';
import { currencySchema, idSchema, minorSchema } from './schemas';
import { WALLET_AMOUNT_MESSAGE, walletSchema } from './wallets';

export const WALLET_PAYOUT_REFERENCE_MAX = 80;
export const WALLET_REFUND_EMAIL_MAX = 200;

export const WALLET_REQUEST_NOT_FOUND_MESSAGE = 'Request not found';
export const WALLET_TOPUP_NOT_FOUND_MESSAGE = 'Top-up not found';
export const WALLET_REFUND_REASON_MESSAGE =
  'Say why the money is being paid back.';
export const WALLET_REFUND_EMAIL_MESSAGE = 'Enter the parent’s email address.';
export const WALLET_REFUND_PROOF_REQUIRED_MESSAGE =
  'Attach the parent’s email before asking for a refund.';
export const WALLET_REFUND_PROOF_DENIED_MESSAGE =
  'You need permission to ask for wallet refunds.';
export const WALLET_REFUND_PROOF_LOCKED_MESSAGE =
  'The parent’s email is kept with its refund request and can’t be removed.';
export const WALLET_REFUND_ACCOUNT_MESSAGE =
  'A refund is paid out of a bank account. Choose one.';
export const WALLET_REFUND_PROOF_NOT_FOUND_MESSAGE = 'Parent’s email not found';
export const WALLET_REFUND_PROOF_TAKEN_MESSAGE =
  'That email is already attached to another refund request.';
export const WALLET_REFUND_PAYOUT_ACCOUNT_MESSAGE =
  'The bank account chosen for this refund can no longer pay out. Decline the request and ask for it again.';
export const WALLET_PAYOUT_REFERENCE_TAKEN_MESSAGE =
  'That payout reference is already used by another refund.';
export const WALLET_CANCEL_REASON_MESSAGE =
  'Say why this top-up is being cancelled.';
export const WALLET_CANCEL_ONLINE_MESSAGE =
  'An online top-up comes from Monnify and can’t be cancelled here.';
export const WALLET_CANCEL_EXISTS_MESSAGE =
  'This top-up already has a cancellation that is waiting or done.';
export const WALLET_PAYOUT_REFERENCE_MESSAGE =
  'Enter the bank’s reference for the payout.';
export const WALLET_REQUEST_MONEY_GONE_MESSAGE =
  'The money is no longer free in this wallet. Decline the request, or ask the office to check the wallet.';

export const walletRefundOverMessage = (freeMinor: number): string =>
  `That is more than is free to refund. You can refund up to ${naira(Math.max(0, freeMinor))}.`;
export const walletCancelOverMessage = (
  topUpMinor: number,
  freeMinor: number
): string =>
  `Only ${naira(Math.max(0, freeMinor))} of this ${naira(topUpMinor)} top-up is still free to use, so it can’t be cancelled.`;

const countSchema = z.number().int().nonnegative();
const reasonSchema = (required: string) =>
  z
    .string({ error: required })
    .trim()
    .min(1, required)
    .max(
      APPROVAL_REASON_MAX,
      `Use ${APPROVAL_REASON_MAX} characters or fewer.`
    );

export const walletTopUpParamsSchema = z.object({
  walletId: idSchema,
  topUpId: idSchema,
});
export type WalletTopUpParams = z.output<typeof walletTopUpParamsSchema>;

export const refundOptionsSchema = z.object({
  currency: currencySchema,
  accounts: z.array(
    z.object({
      id: idSchema,
      label: z.string(),
      kind: moneyAccountKindSchema,
    })
  ),
});
export type RefundOptions = z.infer<typeof refundOptionsSchema>;

export const requestWalletRefundSchema = z.object({
  reference: paymentReferenceSchema,
  moneyAccountId: idSchema,
  amountMinor: z
    .number({ error: WALLET_AMOUNT_MESSAGE })
    .int(WALLET_AMOUNT_MESSAGE)
    .positive(WALLET_AMOUNT_MESSAGE),
  parentEmail: z
    .string({ error: WALLET_REFUND_EMAIL_MESSAGE })
    .trim()
    .max(WALLET_REFUND_EMAIL_MAX, WALLET_REFUND_EMAIL_MESSAGE)
    .pipe(z.email(WALLET_REFUND_EMAIL_MESSAGE)),
  reason: reasonSchema(WALLET_REFUND_REASON_MESSAGE),
  proofFileId: idSchema,
});
export type RequestWalletRefundInput = z.input<
  typeof requestWalletRefundSchema
>;
export type RequestWalletRefund = z.output<typeof requestWalletRefundSchema>;

export const requestWalletCancellationSchema = z.object({
  reference: paymentReferenceSchema,
  reason: reasonSchema(WALLET_CANCEL_REASON_MESSAGE),
});
export type RequestWalletCancellationInput = z.input<
  typeof requestWalletCancellationSchema
>;
export type RequestWalletCancellation = z.output<
  typeof requestWalletCancellationSchema
>;

export const approveWalletRefundSchema = z.object({
  payoutReference: z
    .string({ error: WALLET_PAYOUT_REFERENCE_MESSAGE })
    .trim()
    .min(1, WALLET_PAYOUT_REFERENCE_MESSAGE)
    .max(
      WALLET_PAYOUT_REFERENCE_MAX,
      `Use ${WALLET_PAYOUT_REFERENCE_MAX} characters or fewer.`
    ),
});
export type ApproveWalletRefundInput = z.input<
  typeof approveWalletRefundSchema
>;

const requestBaseSchema = z.object({
  id: idSchema,
  status: approvalStatusSchema,
  reference: z.string(),
  reason: z.string(),
  amountMinor: minorSchema.positive(),
  wallet: z.object({ id: idSchema, guardianName: z.string() }),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  decidedBy: z.string().nullable(),
  decidedAt: z.iso.datetime({ offset: true }).nullable(),
  rejectionReason: z.string().nullable(),
});

export const walletRefundRequestSchema = requestBaseSchema.extend({
  kind: z.literal('wallet_refund'),
  parentEmail: z.string(),
  moneyAccountName: z.string(),
  payoutReference: z.string().nullable(),
  proofFileId: idSchema,
});
export type WalletRefundRequest = z.infer<typeof walletRefundRequestSchema>;

export const walletCancellationRequestSchema = requestBaseSchema.extend({
  kind: z.literal('wallet_topup_cancellation'),
  topUp: z.object({ id: idSchema, reference: z.string() }),
});
export type WalletCancellationRequest = z.infer<
  typeof walletCancellationRequestSchema
>;

export const walletRequestSchema = z.discriminatedUnion('kind', [
  walletRefundRequestSchema,
  walletCancellationRequestSchema,
]);
export type WalletRequest = z.infer<typeof walletRequestSchema>;

export const walletRequestListQuerySchema = z.object({
  kind: walletApprovalKindSchema.optional(),
  status: approvalStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type WalletRequestListQuery = z.output<
  typeof walletRequestListQuerySchema
>;

export const walletRequestListSchema = z.object({
  currency: currencySchema,
  items: z.array(walletRequestSchema),
  total: countSchema,
  waitingCount: countSchema,
});
export type WalletRequestList = z.infer<typeof walletRequestListSchema>;

export const requestedWalletRefundSchema = z.object({
  request: walletRefundRequestSchema,
  replayed: z.boolean(),
  wallet: walletSchema,
});
export type RequestedWalletRefund = z.infer<typeof requestedWalletRefundSchema>;

export const requestedWalletCancellationSchema = z.object({
  request: walletCancellationRequestSchema,
  replayed: z.boolean(),
  wallet: walletSchema,
});
export type RequestedWalletCancellation = z.infer<
  typeof requestedWalletCancellationSchema
>;
