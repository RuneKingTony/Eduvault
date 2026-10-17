import { z } from 'zod';
import { FINANCE_PAGE_SIZE, FINANCE_PAGE_SIZE_MAX } from './finance';
import { currencySchema, idSchema } from './schemas';
import { studentLifeSchema } from './students';

export const BALANCE_FILTERS = [
  'owing',
  'owing_current',
  'owing_gone',
  'paid',
  'all',
] as const;
export const STATEMENT_ROW_STATUSES = [
  'charged',
  'paid',
  'reduced',
  'cancelled',
  'refunded',
] as const;
export const BALANCE_SEARCH_MAX = 120;

export const STUDENT_ACCOUNT_NOT_FOUND_MESSAGE = 'Student account not found';
export const GUARDIAN_ACCOUNT_NOT_FOUND_MESSAGE = 'Family account not found';

export const balanceFilterSchema = z.enum(BALANCE_FILTERS);
export type BalanceFilter = z.infer<typeof balanceFilterSchema>;

export const statementRowStatusSchema = z.enum(STATEMENT_ROW_STATUSES);
export type StatementRowStatus = z.infer<typeof statementRowStatusSchema>;

const minorSchema = z.number().int();
const countSchema = z.number().int().nonnegative();

export const balanceListQuerySchema = z.object({
  filter: balanceFilterSchema.default('owing'),
  q: z.string().trim().max(BALANCE_SEARCH_MAX).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type BalanceListQuery = z.output<typeof balanceListQuerySchema>;

export const balanceRowSchema = z.object({
  studentId: idSchema,
  name: z.string(),
  admissionNumber: z.string(),
  lifecycle: studentLifeSchema,
  className: z.string().nullable(),
  guardian: z
    .object({ id: idSchema, name: z.string(), phone: z.string() })
    .nullable(),
  balanceMinor: minorSchema,
  paidMinor: minorSchema,
  totalMinor: minorSchema,
});
export type BalanceRow = z.infer<typeof balanceRowSchema>;

export const balanceSummarySchema = z.object({
  totalOwedMinor: minorSchema.nonnegative(),
  studentsOwing: countSchema,
  studentsInScope: countSchema,
  receivedThisTermMinor: minorSchema.nonnegative().optional(),
  paymentsThisTerm: countSchema.optional(),
  scopeNote: z.string(),
});
export type BalanceSummary = z.infer<typeof balanceSummarySchema>;

export const balanceListSchema = z.object({
  currency: currencySchema,
  items: z.array(balanceRowSchema),
  total: countSchema,
  summary: balanceSummarySchema,
});
export type BalanceList = z.infer<typeof balanceListSchema>;

export const statementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type StatementQuery = z.output<typeof statementQuerySchema>;

export const statementParamsSchema = z.object({ studentId: idSchema });
export const guardianStatementParamsSchema = z.object({
  guardianId: idSchema,
});

export const statementLinkSchema = z
  .object({ type: z.enum(['invoice', 'payment']), id: idSchema })
  .nullable();
export type StatementLink = z.infer<typeof statementLinkSchema>;

export const statementRowSchema = z.object({
  entryId: idSchema,
  effectiveOn: z.iso.date(),
  reference: z.string(),
  description: z.string(),
  status: statementRowStatusSchema,
  amountMinor: minorSchema.positive(),
  link: statementLinkSchema,
});
export type StatementRow = z.infer<typeof statementRowSchema>;

export const statementUnpaidSchema = z.object({
  reference: z.string(),
  outstandingMinor: minorSchema.positive(),
  link: statementLinkSchema,
});
export type StatementUnpaid = z.infer<typeof statementUnpaidSchema>;

export const statementTotalsSchema = z.object({
  balanceMinor: minorSchema,
  totalMinor: minorSchema,
  paidMinor: minorSchema,
  reducedMinor: minorSchema,
});
export type StatementTotals = z.infer<typeof statementTotalsSchema>;

export const statementFamilySchema = z
  .object({
    guardianId: idSchema,
    guardianName: z.string(),
    childCount: countSchema,
  })
  .nullable();
export type StatementFamily = z.infer<typeof statementFamilySchema>;

export const studentStatementSchema = z.object({
  currency: currencySchema,
  student: z.object({
    id: idSchema,
    name: z.string(),
    admissionNumber: z.string(),
    className: z.string().nullable(),
    campusName: z.string(),
    archived: z.boolean(),
  }),
  totals: statementTotalsSchema,
  rows: z.array(statementRowSchema),
  total: countSchema,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  unpaid: z.array(statementUnpaidSchema),
  family: statementFamilySchema,
});
export type StudentStatement = z.infer<typeof studentStatementSchema>;

export const guardianStatementSchema = z.object({
  currency: currencySchema,
  guardian: z.object({ id: idSchema, name: z.string() }),
  familyTotalMinor: minorSchema.nonnegative(),
  creditMinor: minorSchema.nonnegative(),
  children: z.array(studentStatementSchema),
});
export type GuardianStatement = z.infer<typeof guardianStatementSchema>;
