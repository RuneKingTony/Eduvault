import { z } from 'zod';
import { addDays } from '@eduvault/shared';
import {
  ANNOUNCEMENT_PAGE_SIZE,
  announcementSummarySchema,
} from './announcements';
import { FINANCE_PAGE_SIZE, FINANCE_PAGE_SIZE_MAX } from './finance';
import { currencySchema, idSchema } from './schemas';
import {
  statementRowStatusSchema,
  statementTotalsSchema,
} from './student-accounts';

export const PORTAL_STUDENT_NOT_FOUND_MESSAGE = 'Student not found';
export const PORTAL_ANNOUNCEMENTS_MAX = 5;
export const NEW_ANNOUNCEMENT_DAYS = 7;

export const newAnnouncementsSince = (today: string): string =>
  addDays(today, -NEW_ANNOUNCEMENT_DAYS);

export const isNewAnnouncement = (
  publishedOn: string,
  today: string
): boolean => publishedOn >= newAnnouncementsSince(today);

export const portalKindSchema = z.enum(['student', 'guardian']);
export type PortalKind = z.infer<typeof portalKindSchema>;

export const portalChildSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  className: z.string().nullable(),
  campusName: z.string(),
  archived: z.boolean(),
  balanceMinor: z.number().int().optional(),
});
export type PortalChild = z.infer<typeof portalChildSchema>;

export const portalMeSchema = z.object({
  kind: portalKindSchema,
  name: z.string(),
  firstName: z.string(),
  login: z.object({
    username: z.string().nullable(),
    email: z.string().nullable(),
  }),
  school: z.object({
    name: z.string(),
    admissionPrefix: z.string(),
    currency: currencySchema,
    logoUrl: z.string().nullable(),
  }),
  children: z.array(portalChildSchema),
});
export type PortalMe = z.infer<typeof portalMeSchema>;

export const portalStudentParamsSchema = z.object({ studentId: idSchema });

export const portalStudentSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  admissionNumber: z.string(),
  dateOfBirth: z.iso.date(),
  className: z.string().nullable(),
  campusName: z.string(),
  classTeacherName: z.string().nullable(),
  username: z.string().nullable(),
  archived: z.boolean(),
});
export type PortalStudent = z.infer<typeof portalStudentSchema>;

export const portalAnnouncementsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PORTAL_ANNOUNCEMENTS_MAX)
    .default(PORTAL_ANNOUNCEMENTS_MAX),
});
export type PortalAnnouncementsQuery = z.output<
  typeof portalAnnouncementsQuerySchema
>;

export const portalAnnouncementsSchema = z.object({
  items: z.array(announcementSummarySchema),
  newThisWeek: z.number().int().nonnegative(),
});
export type PortalAnnouncements = z.infer<typeof portalAnnouncementsSchema>;

export const portalAnnouncementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(ANNOUNCEMENT_PAGE_SIZE),
});
export type PortalAnnouncementListQuery = z.output<
  typeof portalAnnouncementListQuerySchema
>;

export const portalAnnouncementListSchema = z.object({
  items: z.array(announcementSummarySchema),
  total: z.number().int().nonnegative(),
});
export type PortalAnnouncementList = z.infer<
  typeof portalAnnouncementListSchema
>;

export const portalStatementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(FINANCE_PAGE_SIZE_MAX)
    .default(FINANCE_PAGE_SIZE),
});
export type PortalStatementQuery = z.output<typeof portalStatementQuerySchema>;

export const portalStatementRowSchema = z.object({
  effectiveOn: z.iso.date(),
  description: z.string(),
  status: statementRowStatusSchema,
  amountMinor: z.number().int().positive(),
});
export type PortalStatementRow = z.infer<typeof portalStatementRowSchema>;

export const portalStatementUnpaidSchema = z.object({
  number: z.string(),
  outstandingMinor: z.number().int().positive(),
});
export type PortalStatementUnpaid = z.infer<typeof portalStatementUnpaidSchema>;

export const portalStatementSchema = z.object({
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
  rows: z.array(portalStatementRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  unpaid: z.array(portalStatementUnpaidSchema),
});
export type PortalStatement = z.infer<typeof portalStatementSchema>;

export const portalFamilyStatementSchema = z.object({
  currency: currencySchema,
  totalOwedMinor: z.number().int().nonnegative(),
  creditMinor: z.number().int().nonnegative(),
  children: z.array(
    z.object({
      studentId: idSchema,
      name: z.string(),
      className: z.string().nullable(),
      campusName: z.string(),
      archived: z.boolean(),
      balanceMinor: z.number().int(),
    })
  ),
});
export type PortalFamilyStatement = z.infer<typeof portalFamilyStatementSchema>;
