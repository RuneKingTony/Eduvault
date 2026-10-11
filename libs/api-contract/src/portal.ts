import { z } from 'zod';
import { addDays } from '@eduvault/shared';
import { announcementSummarySchema } from './announcements';
import { idSchema } from './schemas';

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
