import { z } from 'zod';
import { FINANCE_PAGE_SIZE, FINANCE_PAGE_SIZE_MAX } from './finance';
import { invoiceSummarySchema } from './invoices';
import { currencySchema, idSchema } from './schemas';

export const BILLING_SCOPES = ['school', 'campus', 'level'] as const;
export const BILLING_RUN_STATUSES = ['draft', 'issued', 'cancelled'] as const;
export const BILLING_CHARGED_STATES = ['all', 'partly', 'none'] as const;

export const BILLING_TERM_MESSAGE = 'Choose the current term or the next term.';
export const BILLING_CAMPUS_REQUIRED_MESSAGE = 'Choose a campus.';
export const BILLING_LEVEL_REQUIRED_MESSAGE = 'Choose a level.';
export const BILLING_RUN_NOT_FOUND_MESSAGE = 'Charge round not found';
export const BILLING_CAMPUS_NOT_FOUND_MESSAGE = 'Campus not found';
export const BILLING_ALREADY_SENT_MESSAGE = 'This round has already been sent.';
export const BILLING_CANCELLED_MESSAGE = 'This round was cancelled.';
export const BILLING_ONLY_DRAFTS_MESSAGE = 'Only drafts can be cancelled.';
export const BILLING_OUT_OF_SCOPE_MESSAGE =
  'This round includes students on campuses you don’t look after.';

export const billingScopeSchema = z.enum(BILLING_SCOPES);
export type BillingScope = z.infer<typeof billingScopeSchema>;

export const billingRunStatusSchema = z.enum(BILLING_RUN_STATUSES);
export type BillingRunStatus = z.infer<typeof billingRunStatusSchema>;

const countSchema = z.number().int().nonnegative();
const minorSchema = z.number().int();

export const prepareBodySchema = z
  .object({
    termId: idSchema,
    scope: billingScopeSchema,
    scopeId: idSchema.optional(),
  })
  .superRefine((body, context) => {
    if (body.scope !== 'school' && body.scopeId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['scopeId'],
        message:
          body.scope === 'campus'
            ? BILLING_CAMPUS_REQUIRED_MESSAGE
            : BILLING_LEVEL_REQUIRED_MESSAGE,
      });
    }
  });
export type PrepareBody = z.input<typeof prepareBodySchema>;

export const prepareResultSchema = z.object({
  runId: idSchema.nullable(),
  number: z.string().nullable(),
  created: countSchema,
  skipped: countSchema,
  none: countSchema,
  termId: idSchema,
});
export type PrepareResult = z.infer<typeof prepareResultSchema>;

export const billingTermSchema = z.object({
  termId: idSchema,
  name: z.string(),
  schoolYearName: z.string(),
  charged: z.enum(BILLING_CHARGED_STATES),
  isDefault: z.boolean(),
  levelIds: z.array(idSchema),
});
export type BillingTerm = z.infer<typeof billingTermSchema>;

export const billingRunSummarySchema = z.object({
  id: idSchema,
  number: z.string(),
  termId: idSchema,
  termName: z.string(),
  scope: billingScopeSchema,
  scopeLabel: z.string(),
  chargeCount: countSchema,
  totalMinor: minorSchema,
  createdBy: z.string().nullable(),
  issuedAt: z.iso.datetime({ offset: true }).nullable(),
  status: billingRunStatusSchema,
});
export type BillingRunSummary = z.infer<typeof billingRunSummarySchema>;

export const billingRunListQuerySchema = z.object({
  status: billingRunStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type BillingRunListQuery = z.output<typeof billingRunListQuerySchema>;

export const billingRunListSchema = z.object({
  currency: currencySchema,
  items: z.array(billingRunSummarySchema),
  total: countSchema,
});
export type BillingRunList = z.infer<typeof billingRunListSchema>;

export const billingRunSchema = billingRunSummarySchema.extend({
  currency: currencySchema,
  createdAt: z.iso.datetime({ offset: true }),
  issuedBy: z.string().nullable(),
  cancelledBy: z.string().nullable(),
  cancelledAt: z.iso.datetime({ offset: true }).nullable(),
  sentCount: countSchema,
  feesChangedSincePrepared: z.boolean(),
  charges: z.array(invoiceSummarySchema),
});
export type BillingRun = z.infer<typeof billingRunSchema>;
