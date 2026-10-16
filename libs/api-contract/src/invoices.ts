import { z } from 'zod';
import {
  FINANCE_PAGE_SIZE,
  FINANCE_PAGE_SIZE_MAX,
  journalLineSchema,
} from './finance';
import { currencySchema, idSchema } from './schemas';

export const INVOICE_KINDS = ['term', 'adhoc', 'store'] as const;
export const INVOICE_STATUSES = ['draft', 'issued', 'cancelled'] as const;
export const INVOICE_SEARCH_MAX = 120;

export const INVOICE_NOT_FOUND_MESSAGE = 'Charge not found';
export const INVOICE_STUDENT_NOT_FOUND_MESSAGE = 'Student not found';

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
});
export type Invoice = z.infer<typeof invoiceSchema>;
