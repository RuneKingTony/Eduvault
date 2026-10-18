import { z } from 'zod';
import {
  FINANCE_PAGE_SIZE,
  FINANCE_PAGE_SIZE_MAX,
  journalLineSchema,
} from './finance';
import { currencySchema, datedReference, idSchema } from './schemas';

export const INVOICE_KINDS = ['term', 'adhoc', 'store'] as const;
export const INVOICE_STATUSES = ['draft', 'issued', 'cancelled'] as const;
export const INVOICE_SEARCH_MAX = 120;

export const INVOICE_CHARGE_REFERENCE_MAX = 80;
export const INVOICE_CHARGE_LINES_MAX = 20;
export const INVOICE_CHARGE_DESCRIPTION_MAX = 300;
export const INVOICE_CHARGE_AMOUNT_MAX_MINOR = 1_000_000_000_000;

export const INVOICE_NOT_FOUND_MESSAGE = 'Charge not found';
export const INVOICE_STUDENT_NOT_FOUND_MESSAGE = 'Student not found';
export const INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE =
  'Only students on the roll can be charged.';
export const INVOICE_NO_TERM_MESSAGE =
  'There is no current term. Set one before adding a charge.';
export const INVOICE_REFERENCE_TAKEN_MESSAGE =
  'That reference is already used by another record.';
export const INVOICE_CHARGE_REPLAYED_MESSAGE = 'This charge was already added.';
export const INVOICE_CHARGE_REFERENCE_REQUIRED_MESSAGE = 'Enter a reference.';
export const INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE =
  'Describe the charge.';
export const INVOICE_CHARGE_DESCRIPTION_MAX_MESSAGE = `Keep the description under ${INVOICE_CHARGE_DESCRIPTION_MAX} characters.`;
export const INVOICE_CHARGE_AMOUNT_MESSAGE = 'Enter an amount above zero.';
export const INVOICE_CHARGE_LINES_REQUIRED_MESSAGE = 'Add at least one line.';
export const INVOICE_CHARGE_LINES_MAX_MESSAGE = `A charge has at most ${INVOICE_CHARGE_LINES_MAX} lines.`;
export const invoiceReferenceUsedMessage = (
  reference: string,
  number: string
): string => `Reference ${reference} is already used by ${number}.`;

export const oneOffChargeReference = (date: string, uuid: string): string =>
  datedReference('ONEOFF', date, uuid);

export const invoiceKindSchema = z.enum(INVOICE_KINDS);
export type InvoiceKind = z.infer<typeof invoiceKindSchema>;

export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

const minorSchema = z.number().int();
const countSchema = z.number().int().nonnegative();

export const invoiceSummarySchema = z.object({
  id: idSchema,
  number: z.string().nullable(),
  studentId: idSchema,
  studentName: z.string(),
  admissionNumber: z.string(),
  armName: z.string().nullable(),
  kind: invoiceKindSchema,
  termId: idSchema,
  termName: z.string(),
  forText: z.string(),
  feeCount: countSchema,
  totalMinor: minorSchema,
  status: invoiceStatusSchema,
  date: z.iso.date(),
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

export const invoiceListQuerySchema = z.object({
  kind: invoiceKindSchema.optional(),
  status: invoiceStatusSchema.optional(),
  q: z.string().trim().max(INVOICE_SEARCH_MAX).optional(),
  studentId: idSchema.optional(),
  termId: idSchema.optional(),
  billingRunId: idSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type InvoiceListQuery = z.output<typeof invoiceListQuerySchema>;

export const invoiceCountsSchema = z.object({
  term: countSchema,
  adhoc: countSchema,
  store: countSchema,
});
export type InvoiceCounts = z.infer<typeof invoiceCountsSchema>;

export const invoiceSummaryLineSchema = z.object({
  sentCount: countSchema,
  sentTotalMinor: minorSchema,
  draftCount: countSchema,
});
export type InvoiceListSummary = z.infer<typeof invoiceSummaryLineSchema>;

export const invoiceListSchema = z.object({
  currency: currencySchema,
  items: z.array(invoiceSummarySchema),
  total: countSchema,
  counts: invoiceCountsSchema,
  summary: invoiceSummaryLineSchema,
});
export type InvoiceList = z.infer<typeof invoiceListSchema>;

export const invoiceLineSchema = z.object({
  id: idSchema,
  description: z.string(),
  amountMinor: minorSchema,
  ledgerAccountId: idSchema,
  feeLineId: idSchema.nullable(),
  studentDiscountId: idSchema.nullable(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export const invoiceJournalSchema = z.object({
  reference: z.string(),
  lines: z.array(journalLineSchema),
  balanced: z.boolean(),
});
export type InvoiceJournal = z.infer<typeof invoiceJournalSchema>;

export const invoiceSchema = z.object({
  currency: currencySchema,
  id: idSchema,
  number: z.string().nullable(),
  kind: invoiceKindSchema,
  status: invoiceStatusSchema,
  student: z.object({
    id: idSchema,
    name: z.string(),
    admissionNumber: z.string(),
    armName: z.string().nullable(),
  }),
  termId: idSchema,
  termName: z.string(),
  campusId: idSchema,
  campusName: z.string(),
  lines: z.array(invoiceLineSchema),
  totalMinor: minorSchema,
  broughtForwardMinor: minorSchema,
  dueAtIssueMinor: minorSchema,
  balanceTodayMinor: minorSchema,
  billingRun: z.object({ id: idSchema, number: z.string() }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  issuedAt: z.iso.datetime({ offset: true }).nullable(),
  issuedBy: z.string().nullable(),
  chargedTo: z
    .object({ name: z.string(), relationship: z.string() })
    .nullable(),
  journal: invoiceJournalSchema.nullable(),
  source: z
    .object({ kind: z.literal('store_sale'), id: idSchema, number: z.string() })
    .nullable(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

const chargeText = (max: number, required: string, tooLong: string) =>
  z.string({ error: required }).trim().min(1, required).max(max, tooLong);

export const oneOffChargeLineSchema = z.object({
  feeTypeId: idSchema,
  description: chargeText(
    INVOICE_CHARGE_DESCRIPTION_MAX,
    INVOICE_CHARGE_DESCRIPTION_REQUIRED_MESSAGE,
    INVOICE_CHARGE_DESCRIPTION_MAX_MESSAGE
  ),
  amountMinor: z
    .number({ error: INVOICE_CHARGE_AMOUNT_MESSAGE })
    .int(INVOICE_CHARGE_AMOUNT_MESSAGE)
    .positive(INVOICE_CHARGE_AMOUNT_MESSAGE)
    .max(INVOICE_CHARGE_AMOUNT_MAX_MINOR, INVOICE_CHARGE_AMOUNT_MESSAGE),
});
export type OneOffChargeLine = z.infer<typeof oneOffChargeLineSchema>;

export const createOneOffChargeSchema = z.object({
  studentId: idSchema,
  reference: chargeText(
    INVOICE_CHARGE_REFERENCE_MAX,
    INVOICE_CHARGE_REFERENCE_REQUIRED_MESSAGE,
    `Use ${INVOICE_CHARGE_REFERENCE_MAX} characters or fewer.`
  ),
  lines: z
    .array(oneOffChargeLineSchema)
    .min(1, INVOICE_CHARGE_LINES_REQUIRED_MESSAGE)
    .max(INVOICE_CHARGE_LINES_MAX, INVOICE_CHARGE_LINES_MAX_MESSAGE),
});
export type CreateOneOffCharge = z.infer<typeof createOneOffChargeSchema>;

export const createdChargeSchema = invoiceSchema.extend({
  replayed: z.boolean(),
});
export type CreatedCharge = z.infer<typeof createdChargeSchema>;
