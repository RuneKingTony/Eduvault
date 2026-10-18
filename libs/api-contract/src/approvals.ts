import { z } from 'zod';
import type { Permission } from '@eduvault/policy';
import { ADJUSTMENT_KIND_LABELS } from './adjustment-kinds';
import {
  currencySchema,
  idSchema,
  memberRefSchema,
  type ApprovalRules,
} from './schemas';

export const APPROVAL_STATUSES = ['submitted', 'approved', 'rejected'] as const;
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const APPROVAL_KINDS = [
  'payment_void',
  'credit_note',
  'write_off',
  'refund',
  'discount',
  'leave',
  'store_write_off',
] as const;
export const approvalKindSchema = z.enum(APPROVAL_KINDS);
export type ApprovalKind = z.infer<typeof approvalKindSchema>;

export const APPROVAL_KIND_LABELS = {
  payment_void: 'Cancel a payment',
  ...ADJUSTMENT_KIND_LABELS,
  discount: 'Discount',
  leave: 'Leave',
  store_write_off: 'Store write-off',
} as const satisfies Record<ApprovalKind, string>;

export type MoneyApprovalKind = Exclude<ApprovalKind, 'leave'>;

export const APPROVAL_PILLARS = ['money', 'leave'] as const;
export const approvalPillarSchema = z.enum(APPROVAL_PILLARS);
export type ApprovalPillar = z.infer<typeof approvalPillarSchema>;

export const isMoneyApproval = (
  kind: ApprovalKind
): kind is MoneyApprovalKind => kind !== 'leave';

export const APPROVAL_KIND_PERMISSION = {
  payment_void: 'adjustment:approve',
  credit_note: 'adjustment:approve',
  write_off: 'adjustment:approve',
  refund: 'adjustment:approve',
  discount: 'adjustment:approve',
  leave: 'leave:approve',
  store_write_off: 'adjustment:approve',
} as const satisfies Record<ApprovalKind, Permission>;

export const APPROVAL_KIND_READ_PERMISSION = {
  payment_void: 'adjustment:read',
  credit_note: 'adjustment:read',
  write_off: 'adjustment:read',
  refund: 'adjustment:read',
  discount: 'adjustment:read',
  store_write_off: 'store:read',
} as const satisfies Record<MoneyApprovalKind, Permission>;

export const APPROVAL_PAGE_SIZE = 10;
export const APPROVAL_PREVIEW_SIZE = 5;
export const APPROVAL_REASON_MAX = 500;

export const SELF_APPROVAL_MESSAGE =
  'You created this. Someone else must approve it.';
export const ALREADY_DECIDED_MESSAGE = 'This has already been decided.';
export const DECLINE_REASON_MESSAGE =
  'Say why you are declining. The person who asked will see it.';
export const APPROVAL_NOT_FOUND_MESSAGE = 'Request not found';

export const declineSchema = z.object({
  reason: z
    .string({ error: DECLINE_REASON_MESSAGE })
    .trim()
    .min(1, DECLINE_REASON_MESSAGE)
    .max(
      APPROVAL_REASON_MAX,
      `Use ${APPROVAL_REASON_MAX} characters or fewer.`
    ),
});
export type DeclineInput = z.input<typeof declineSchema>;

export const approvalDecideSchema = z.enum(['yes', 'own', 'other']);
export type ApprovalDecide = z.infer<typeof approvalDecideSchema>;

export const approvalItemSchema = z.object({
  kind: approvalKindSchema,
  id: idSchema,
  label: z.string(),
  details: z.string(),
  amountMinor: z.number().int().nullable(),
  amountText: z.string().nullable(),
  createdBy: memberRefSchema,
  createdAt: z.iso.datetime({ offset: true }),
  campusId: idSchema.nullable(),
  decide: approvalDecideSchema,
});
export type ApprovalItem = z.infer<typeof approvalItemSchema>;

export const approvalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  includeOthers: z.union([z.boolean(), z.stringbool()]).default(false),
  pillar: approvalPillarSchema.optional(),
  campusId: idSchema.optional(),
});
export type ApprovalListQuery = z.output<typeof approvalListQuerySchema>;

export const approvalListSchema = z.object({
  currency: currencySchema,
  items: z.array(approvalItemSchema),
  total: z.number().int().nonnegative(),
  othersCount: z.number().int().nonnegative(),
  pillars: z.object({
    money: z.number().int().nonnegative(),
    leave: z.number().int().nonnegative(),
  }),
});
export type ApprovalList = z.infer<typeof approvalListSchema>;

export const approvalSummarySchema = z.object({
  waitingForMe: z.number().int().nonnegative(),
  byNav: z.object({
    approvals: z.number().int().nonnegative(),
    payments: z.number().int().nonnegative(),
    store: z.number().int().nonnegative(),
  }),
  currency: currencySchema,
  preview: z.array(approvalItemSchema).max(APPROVAL_PREVIEW_SIZE),
});
export type ApprovalSummary = z.infer<typeof approvalSummarySchema>;

export const APPROVAL_RULE_KEYS = [
  'refund',
  'writeOff',
  'creditNote',
  'discount',
  'paymentVoid',
] as const satisfies readonly (keyof ApprovalRules)[];

export const APPROVAL_RULE_BY_KIND = {
  refund: 'refund',
  write_off: 'writeOff',
  credit_note: 'creditNote',
  discount: 'discount',
  payment_void: 'paymentVoid',
  store_write_off: 'writeOff',
} as const satisfies Record<MoneyApprovalKind, keyof ApprovalRules>;

export const APPROVAL_RULES_ON_MESSAGE =
  'These requests now wait for a boss to approve.';
export const APPROVAL_RULES_OFF_MESSAGE =
  'These requests now go through straight away.';
