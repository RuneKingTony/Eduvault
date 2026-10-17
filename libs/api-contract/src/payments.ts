import { PROOF_FILE_TYPES, naira } from '@eduvault/shared';
import { z } from 'zod';
import { approvalStatusSchema } from './approvals';
import { FINANCE_PAGE_SIZE, FINANCE_PAGE_SIZE_MAX } from './finance';
import { invoiceJournalSchema } from './invoices';
import {
  currencySchema,
  idSchema,
  paymentMethodSchema,
  paymentMethodsSchema,
} from './schemas';

export const PAYMENT_STATUSES = ['posted', 'void_pending', 'voided'] as const;
export const PAYMENT_REFERENCE_MAX = 80;
export const PAYMENT_PAYER_NAME_MAX = 120;
export const PAYMENT_SEARCH_MAX = 120;

export const PAYMENT_PROOF = {
  maxBytes: 10 * 1_048_576,
  types: PROOF_FILE_TYPES,
} as const;

export const PAYMENT_PROOF_REQUIRED_MESSAGE =
  'Add the proof of transfer (a photo, screenshot or PDF) before recording.';
export const PAYMENT_PROOF_TYPE_MESSAGE =
  'The proof must be a photo, a screenshot or a PDF.';
export const PAYMENT_PROOF_SIZE_MESSAGE =
  'That proof is over 10 MB. Please choose a smaller one.';
export const PAYMENT_PROOF_INVALID_MESSAGE =
  'That proof can’t be used. Please upload it again.';
export const PAYMENT_PROOF_DENIED_MESSAGE =
  'You need permission to record payments.';
export const PAYMENT_PROOF_TAKEN_MESSAGE =
  'That proof is already attached to another payment.';
export const PAYMENT_PROOF_LOCKED_MESSAGE =
  'A proof of transfer is kept with its receipt and can’t be removed.';

export const PAYMENT_AMOUNT_MESSAGE = 'Enter the amount received.';
export const PAYMENT_REFERENCE_REQUIRED_MESSAGE =
  'Enter a reference. It makes a retried request apply at most once.';
export const PAYMENT_PAYER_REQUIRED_MESSAGE = 'Enter who paid.';
export const PAYMENT_NO_ALLOCATION_MESSAGE =
  'Split the payment across at least one student.';
export const PAYMENT_ALLOCATION_TWICE_MESSAGE =
  'A student can appear only once in the split.';
export const PAYMENT_FUTURE_DATE_MESSAGE = 'Paid on can’t be after today.';
export const PAYMENT_METHOD_OFF_MESSAGE =
  'That way of paying is switched off in Payment rules.';
export const PAYMENT_ACCOUNT_RETIRED_MESSAGE =
  'That account is retired. Choose another one.';
export const PAYMENT_ACCOUNT_GATEWAY_MESSAGE =
  'Payments through a gateway are recorded for you. Choose another account.';
export const PAYMENT_ACCOUNT_NOT_FOUND_MESSAGE = 'Money account not found';
export const PAYMENT_STUDENT_NOT_FOUND_MESSAGE = 'Student not found';
export const PAYMENT_GUARDIAN_NOT_FOUND_MESSAGE = 'Guardian not found';
export const PAYMENT_PROOF_NOT_FOUND_MESSAGE = 'Proof not found';
export const PAYMENT_NOT_FOUND_MESSAGE = 'Receipt not found';

export const paymentSplitMismatchMessage = (
  totalMinor: number,
  amountMinor: number
): string =>
  `Allocations add up to ${naira(totalMinor)} but the payment is ${naira(amountMinor)}.`;
export const paymentReferenceUsedMessage = (
  reference: string,
  receiptNumber: string
): string => `Reference ${reference} is already used by ${receiptNumber}.`;
export const PAYMENT_REFERENCE_TAKEN_MESSAGE =
  'That reference is already used by another record.';
export const PAYMENT_PROVIDER_REFERENCE_TAKEN_MESSAGE =
  'That bank or POS reference is already on another receipt.';
export const paymentProviderReferenceUsedMessage = (
  reference: string,
  receiptNumber: string
): string => `Provider reference ${reference} is already on ${receiptNumber}.`;

export const PAYMENT_VOID_REASON_MAX = 500;
export const PAYMENT_VOID_REASON_MESSAGE =
  'Say why this receipt is being cancelled.';
export const PAYMENT_VOID_EXISTS_MESSAGE =
  'A void already exists for this payment.';
export const PAYMENT_VOID_NOT_RECORDED_MESSAGE =
  'Only a recorded payment can be cancelled.';
export const PAYMENT_VOID_STORE_SALE_MESSAGE =
  'This payment is for a store sale. It can’t be cancelled on its own.';
export const PAYMENT_VOID_OTHER_CAMPUS_MESSAGE =
  'This payment also covers students on other campuses. Ask someone who can see all of them.';
export const PAYMENT_VOID_NOT_FOUND_MESSAGE = 'Cancellation not found';
export const PAYMENT_VOID_SUBMITTED_MESSAGE =
  'Void requested. It needs a second person’s approval.';
export const PAYMENT_VOID_APPLIED_MESSAGE =
  'Payment cancelled. The receipt is kept, and the family owes that money again.';

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentReferenceSchema = z
  .string({ error: PAYMENT_REFERENCE_REQUIRED_MESSAGE })
  .trim()
  .min(1, PAYMENT_REFERENCE_REQUIRED_MESSAGE)
  .max(
    PAYMENT_REFERENCE_MAX,
    `Use ${PAYMENT_REFERENCE_MAX} characters or fewer.`
  );

const minorSchema = z.number().int();
const countSchema = z.number().int().nonnegative();

export const paymentAllocationInputSchema = z.object({
  studentId: idSchema,
  amountMinor: z
    .number({ error: PAYMENT_AMOUNT_MESSAGE })
    .int(PAYMENT_AMOUNT_MESSAGE)
    .positive(PAYMENT_AMOUNT_MESSAGE),
});
export type PaymentAllocationInput = z.infer<
  typeof paymentAllocationInputSchema
>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

export const recordPaymentSchema = z
  .object({
    reference: paymentReferenceSchema,
    payerGuardianId: idSchema.optional(),
    payerName: optionalText(PAYMENT_PAYER_NAME_MAX),
    moneyAccountId: idSchema,
    method: paymentMethodSchema,
    providerReference: optionalText(PAYMENT_REFERENCE_MAX),
    proofFileId: idSchema.optional(),
    amountMinor: z
      .number({ error: PAYMENT_AMOUNT_MESSAGE })
      .int(PAYMENT_AMOUNT_MESSAGE)
      .positive(PAYMENT_AMOUNT_MESSAGE),
    paidOn: z.iso.date(),
    allocations: z
      .array(paymentAllocationInputSchema)
      .min(1, PAYMENT_NO_ALLOCATION_MESSAGE),
  })
  .superRefine((body, context) => {
    if (body.payerGuardianId === undefined && body.payerName === undefined) {
      context.addIssue({
        code: 'custom',
        message: PAYMENT_PAYER_REQUIRED_MESSAGE,
        path: ['payerName'],
      });
    }
    const students = body.allocations.map((row) => row.studentId);
    if (new Set(students).size !== students.length) {
      context.addIssue({
        code: 'custom',
        message: PAYMENT_ALLOCATION_TWICE_MESSAGE,
        path: ['allocations'],
      });
    }
  });
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
export type RecordPayment = z.output<typeof recordPaymentSchema>;

export const paymentListQuerySchema = z.object({
  q: z.string().trim().max(PAYMENT_SEARCH_MAX).optional(),
  status: paymentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type PaymentListQuery = z.output<typeof paymentListQuerySchema>;

export const paymentMoneyAccountSchema = z.object({
  id: idSchema,
  label: z.string(),
});
export type PaymentMoneyAccount = z.infer<typeof paymentMoneyAccountSchema>;

export const paymentAllocationSummarySchema = z.object({
  studentId: idSchema,
  studentName: z.string(),
  amountMinor: minorSchema.positive(),
  inScope: z.boolean(),
});
export type PaymentAllocationSummary = z.infer<
  typeof paymentAllocationSummarySchema
>;

export const paymentSummarySchema = z.object({
  id: idSchema,
  receiptNumber: z.string(),
  reference: z.string(),
  paidOn: z.iso.date(),
  method: paymentMethodSchema,
  payerName: z.string(),
  moneyAccount: paymentMoneyAccountSchema,
  amountMinor: minorSchema.positive(),
  status: paymentStatusSchema,
  allocations: z.array(paymentAllocationSummarySchema),
});
export type PaymentSummary = z.infer<typeof paymentSummarySchema>;

export const paymentListSummarySchema = z.object({
  receiptCount: countSchema,
  receivedMinor: minorSchema.nonnegative(),
  cancellationsWaiting: countSchema,
});
export type PaymentListSummary = z.infer<typeof paymentListSummarySchema>;

export const paymentListSchema = z.object({
  currency: currencySchema,
  items: z.array(paymentSummarySchema),
  total: countSchema,
  summary: paymentListSummarySchema,
});
export type PaymentList = z.infer<typeof paymentListSchema>;

export const paymentAllocationSchema = z.object({
  studentId: idSchema,
  studentName: z.string(),
  className: z.string().nullable(),
  amountMinor: minorSchema.positive(),
  inScope: z.boolean(),
  balanceMinor: minorSchema.nullable(),
});
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

export const paymentVoidSchema = z.object({
  id: idSchema,
  status: approvalStatusSchema,
  reason: z.string(),
  createdBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  rejectionReason: z.string().nullable(),
});
export type PaymentVoid = z.infer<typeof paymentVoidSchema>;

export const paymentSchema = z.object({
  currency: currencySchema,
  id: idSchema,
  receiptNumber: z.string(),
  reference: z.string(),
  providerReference: z.string().nullable(),
  paidOn: z.iso.date(),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  payerName: z.string(),
  payerGuardianId: idSchema.nullable(),
  moneyAccount: paymentMoneyAccountSchema,
  amountMinor: minorSchema.positive(),
  recordedBy: z.string().nullable(),
  recordedAt: z.iso.datetime({ offset: true }),
  proof: z.object({ fileId: idSchema, fileName: z.string() }).nullable(),
  allocations: z.array(paymentAllocationSchema),
  void: paymentVoidSchema.nullable(),
  storeSale: z.object({ id: idSchema, number: z.string() }).nullable(),
  entry: invoiceJournalSchema.nullable(),
  voidEntry: invoiceJournalSchema.nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const recordedPaymentSchema = paymentSchema.extend({
  replayed: z.boolean(),
});
export type RecordedPayment = z.infer<typeof recordedPaymentSchema>;

export const recordingChildSchema = z.object({
  studentId: idSchema,
  name: z.string(),
  admissionNumber: z.string(),
  owesMinor: minorSchema,
});
export type RecordingChild = z.infer<typeof recordingChildSchema>;

export const recordingPayerSchema = z.object({
  guardianId: idSchema,
  name: z.string(),
  children: z.array(recordingChildSchema),
});
export type RecordingPayer = z.infer<typeof recordingPayerSchema>;

export const recordingOptionsSchema = z.object({
  currency: currencySchema,
  today: z.iso.date(),
  accounts: z.array(paymentMoneyAccountSchema),
  methods: paymentMethodsSchema,
  payers: z.array(recordingPayerSchema),
  students: z.array(recordingChildSchema),
});
export type RecordingOptions = z.infer<typeof recordingOptionsSchema>;

export const requestPaymentVoidSchema = z.object({
  reason: z
    .string({ error: PAYMENT_VOID_REASON_MESSAGE })
    .trim()
    .min(1, PAYMENT_VOID_REASON_MESSAGE)
    .max(
      PAYMENT_VOID_REASON_MAX,
      `Use ${PAYMENT_VOID_REASON_MAX} characters or fewer.`
    ),
});
export type RequestPaymentVoidInput = z.input<typeof requestPaymentVoidSchema>;

export const paymentVoidListQuerySchema = z.object({
  status: approvalStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type PaymentVoidListQuery = z.output<typeof paymentVoidListQuerySchema>;

export const paymentVoidItemSchema = paymentVoidSchema.extend({
  payment: z.object({
    id: idSchema,
    receiptNumber: z.string(),
    payerName: z.string(),
  }),
  amountMinor: minorSchema.positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PaymentVoidItem = z.infer<typeof paymentVoidItemSchema>;

export const paymentVoidListSchema = z.object({
  currency: currencySchema,
  items: z.array(paymentVoidItemSchema),
  total: countSchema,
  waitingCount: countSchema,
});
export type PaymentVoidList = z.infer<typeof paymentVoidListSchema>;

export const requestedPaymentVoidSchema = z.object({
  void: paymentVoidItemSchema,
  autoApproved: z.boolean(),
});
export type RequestedPaymentVoid = z.infer<typeof requestedPaymentVoidSchema>;
