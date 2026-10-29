import { naira } from '@eduvault/shared';
import { z } from 'zod';
import { adjustmentKindSchema } from './adjustment-kinds';
import { approvalStatusSchema } from './approvals';
import { FINANCE_PAGE_SIZE, FINANCE_PAGE_SIZE_MAX } from './finance';
import { paymentReferenceSchema } from './payments';
import { currencySchema, idSchema } from './schemas';

export const ADJUSTMENT_REASON_MAX = 200;
export const DISCOUNT_REASON_MAX = 200;

export const DISCOUNT_KINDS = ['percent', 'fixed'] as const;
export const discountKindSchema = z.enum(DISCOUNT_KINDS);
export type DiscountKind = z.infer<typeof discountKindSchema>;

export const ADJUSTMENT_STUDENT_AMOUNT_MESSAGE =
  'Choose a student and enter an amount.';
export const ADJUSTMENT_REASON_MESSAGE = 'Say why. It shows on the statement.';
export const ADJUSTMENT_NOT_FOUND_MESSAGE = 'Request not found';
export const ADJUSTMENT_STUDENT_NOT_FOUND_MESSAGE = 'Student not found';
export const ADJUSTMENT_ACCOUNT_NOT_FOUND_MESSAGE = 'Account not found';
export const ADJUSTMENT_CHARGE_NOT_FOUND_MESSAGE = 'Charge not found';
export const ADJUSTMENT_ACCOUNT_NOT_ALLOWED_MESSAGE =
  'That account can’t be used for this request.';
export const ADJUSTMENT_CHARGE_MESSAGE =
  'Choose one of this student’s sent charges.';
export const ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE = 'Choose an account.';
export const adjustmentReferenceUsedMessage = (
  reference: string,
  number: string
): string => `Reference ${reference} is already used by ${number}.`;
export const ADJUSTMENT_SUBMITTED_MESSAGE =
  'Submitted. A boss must approve it.';
export const ADJUSTMENT_APPLIED_MESSAGE =
  'Done. This request type does not need approval, so it was applied straight away.';
export const DISCOUNT_VALUE_MESSAGE = 'Choose a student and enter a value.';
export const DISCOUNT_PERCENT_MESSAGE = 'A percentage can be at most 100.';
export const DISCOUNT_NOT_FOUND_MESSAGE = 'Discount not found';
export const DISCOUNT_FEE_TYPE_NOT_FOUND_MESSAGE = 'Fee type not found';
export const DISCOUNT_FEE_TYPE_MESSAGE =
  'Choose a fee type under school fees, or the whole charge.';
export const DISCOUNT_PAST_TERM_MESSAGE =
  'A discount can’t start in a past term.';
export const DISCOUNT_UNTIL_MESSAGE = 'Until can’t be before From.';
export const DISCOUNT_TERM_NOT_FOUND_MESSAGE = 'Term not found';
export const DISCOUNT_NOT_APPROVED_MESSAGE =
  'Only an approved discount can be ended.';
export const DISCOUNT_ALREADY_ENDED_MESSAGE =
  'This discount has already ended.';
export const DISCOUNT_END_PAST_MESSAGE =
  'The last term can’t be before the current term.';
export const DISCOUNT_END_BEFORE_FROM_MESSAGE =
  'The last term can’t be before the term the discount starts in.';
export const DISCOUNT_END_AFTER_UNTIL_MESSAGE =
  'The last term can’t be after the term the discount already ends in.';
export const DISCOUNT_SUBMITTED_MESSAGE = 'Discount submitted for approval.';
export const DISCOUNT_APPLIED_MESSAGE =
  'Discount applied. It shows on the next round of charges.';

export const adjustmentRefundCapMessage = (
  name: string,
  creditMinor: number
): string =>
  `A refund pays back credit held. ${name} holds ${naira(creditMinor)} credit.`;
export const ADJUSTMENT_ACCOUNT_RETIRED_NOW_MESSAGE =
  'The account for this request can’t be used any more. Decline it and ask again.';
export const adjustmentRefundNowCapMessage = (
  name: string,
  creditMinor: number
): string =>
  `${name} now holds ${naira(creditMinor)} credit, less than this refund. Decline it and ask again.`;
export const adjustmentWriteOffCapMessage = (
  name: string,
  balanceMinor: number
): string =>
  `You can cancel at most what ${name} owes: ${naira(balanceMinor)}.`;
export const adjustmentWriteOffNowCapMessage = (
  name: string,
  balanceMinor: number
): string =>
  `${name} now owes ${naira(balanceMinor)}, less than this request. Decline it and ask again.`;

const amountSchema = z
  .number({ error: ADJUSTMENT_STUDENT_AMOUNT_MESSAGE })
  .int(ADJUSTMENT_STUDENT_AMOUNT_MESSAGE)
  .positive(ADJUSTMENT_STUDENT_AMOUNT_MESSAGE);

const reasonSchema = (max: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(max, `Use ${max} characters or fewer.`);

export const createAdjustmentSchema = z.object({
  kind: adjustmentKindSchema,
  studentId: idSchema,
  amountMinor: amountSchema,
  reason: reasonSchema(ADJUSTMENT_REASON_MAX, ADJUSTMENT_REASON_MESSAGE),
  ledgerAccountId: idSchema.optional(),
  moneyAccountId: idSchema.optional(),
  invoiceId: idSchema.optional(),
  reference: paymentReferenceSchema.optional(),
});
export type CreateAdjustmentInput = z.input<typeof createAdjustmentSchema>;
export type CreateAdjustment = z.output<typeof createAdjustmentSchema>;

export const adjustmentListQuerySchema = z.object({
  status: approvalStatusSchema.optional(),
  kind: adjustmentKindSchema.optional(),
  studentId: idSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type AdjustmentListQuery = z.output<typeof adjustmentListQuerySchema>;

export const adjustmentStudentSchema = z.object({
  id: idSchema,
  name: z.string(),
  admissionNumber: z.string(),
});
export type AdjustmentStudent = z.infer<typeof adjustmentStudentSchema>;

export const adjustmentSchema = z.object({
  id: idSchema,
  number: z.string(),
  kind: adjustmentKindSchema,
  student: adjustmentStudentSchema,
  amountMinor: z.number().int().positive(),
  reason: z.string(),
  status: approvalStatusSchema,
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  approvedBy: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  ledgerAccountId: idSchema.nullable(),
  moneyAccountId: idSchema.nullable(),
  invoiceId: idSchema.nullable(),
  journalEntryId: idSchema.nullable(),
});
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const adjustmentListSchema = z.object({
  currency: currencySchema,
  items: z.array(adjustmentSchema),
  total: z.number().int().nonnegative(),
  waitingCount: z.number().int().nonnegative(),
});
export type AdjustmentList = z.infer<typeof adjustmentListSchema>;

export const createdAdjustmentSchema = z.object({
  adjustment: adjustmentSchema,
  autoApproved: z.boolean(),
});
export type CreatedAdjustment = z.infer<typeof createdAdjustmentSchema>;

export const createStudentDiscountSchema = z
  .object({
    studentId: idSchema,
    kind: discountKindSchema,
    value: z
      .number({ error: DISCOUNT_VALUE_MESSAGE })
      .int(DISCOUNT_VALUE_MESSAGE)
      .positive(DISCOUNT_VALUE_MESSAGE),
    ledgerAccountId: idSchema.nullable(),
    fromTermId: idSchema,
    toTermId: idSchema.nullable().optional(),
    reason: reasonSchema(DISCOUNT_REASON_MAX, ADJUSTMENT_REASON_MESSAGE),
  })
  .superRefine((body, context) => {
    if (body.kind === 'percent' && body.value > 100) {
      context.addIssue({
        code: 'custom',
        message: DISCOUNT_PERCENT_MESSAGE,
        path: ['value'],
      });
    }
  });
export type CreateStudentDiscountInput = z.input<
  typeof createStudentDiscountSchema
>;
export type CreateStudentDiscount = z.output<
  typeof createStudentDiscountSchema
>;

export const studentDiscountListQuerySchema = z.object({
  status: approvalStatusSchema.optional(),
  studentId: idSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type StudentDiscountListQuery = z.output<
  typeof studentDiscountListQuerySchema
>;

export const discountTermSchema = z.object({ id: idSchema, name: z.string() });
export type DiscountTerm = z.infer<typeof discountTermSchema>;

export const studentDiscountSchema = z.object({
  id: idSchema,
  student: adjustmentStudentSchema,
  kind: discountKindSchema,
  value: z.number().int().positive(),
  feeType: z.object({ id: idSchema, name: z.string() }).nullable(),
  reason: z.string(),
  fromTerm: discountTermSchema,
  toTerm: discountTermSchema.nullable(),
  status: approvalStatusSchema,
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  approvedBy: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type StudentDiscount = z.infer<typeof studentDiscountSchema>;

export const studentDiscountListSchema = z.object({
  currency: currencySchema,
  items: z.array(studentDiscountSchema),
  total: z.number().int().nonnegative(),
  waitingCount: z.number().int().nonnegative(),
});
export type StudentDiscountList = z.infer<typeof studentDiscountListSchema>;

export const termChoiceSchema = z.object({
  id: idSchema,
  label: z.string(),
  startsOn: z.iso.date(),
  isCurrent: z.boolean(),
});
export type TermChoice = z.infer<typeof termChoiceSchema>;

export const createdStudentDiscountSchema = z.object({
  discount: studentDiscountSchema,
  autoApproved: z.boolean(),
});
export type CreatedStudentDiscount = z.infer<
  typeof createdStudentDiscountSchema
>;

export const endStudentDiscountSchema = z.object({ lastTermId: idSchema });
export type EndStudentDiscountInput = z.input<typeof endStudentDiscountSchema>;
