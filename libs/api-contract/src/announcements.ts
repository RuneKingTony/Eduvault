import { z } from 'zod';
import { idSchema } from './schemas';

export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 2000;
export const ANNOUNCEMENT_PAGE_SIZE = 10;
export const ANNOUNCEMENT_FEED_DEFAULT = 4;
export const ANNOUNCEMENT_FEED_MAX = 20;

export const ANNOUNCEMENT_NOT_FOUND_MESSAGE = 'Announcement not found';
export const ANNOUNCEMENT_EVERYONE_MESSAGE =
  'Only someone who sees every campus can change announcements for everyone.';
export const ANNOUNCEMENT_STAFF_ONLY_MESSAGE =
  'Announcements for families are read on the portal.';
export const ANNOUNCEMENT_TEXT_REQUIRED = 'Add a title and a message.';

export const announcementTransitionMessage = (
  action: 'publish' | 'withdraw' | 'pin' | 'draft'
): string => {
  switch (action) {
    case 'publish': {
      return 'Only a draft or withdrawn announcement can be published.';
    }
    case 'withdraw': {
      return 'Only a published announcement can be withdrawn.';
    }
    case 'pin': {
      return 'Only a published announcement can be pinned.';
    }
    case 'draft': {
      return 'A published announcement can’t go back to a draft. Withdraw it first.';
    }
  }
};

export const announcementTagSchema = z.enum([
  'general',
  'academics',
  'event',
  'fees',
]);
export type AnnouncementTag = z.infer<typeof announcementTagSchema>;

export const announcementStatusSchema = z.enum([
  'draft',
  'published',
  'withdrawn',
]);
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;

const personSchema = z.object({ id: idSchema, name: z.string() });

export const announcementSchema = z.object({
  id: idSchema,
  title: z.string(),
  body: z.string(),
  tag: announcementTagSchema,
  campusId: idSchema.nullable(),
  campusName: z.string().nullable(),
  status: announcementStatusSchema,
  pinned: z.boolean(),
  publishedOn: z.iso.date().nullable(),
  withdrawnAt: z.iso.datetime({ offset: true }).nullable(),
  createdBy: personSchema,
  updatedBy: personSchema.nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Announcement = z.infer<typeof announcementSchema>;

export const announcementSummarySchema = z.object({
  id: idSchema,
  title: z.string(),
  body: z.string(),
  tag: announcementTagSchema,
  pinned: z.boolean(),
  publishedOn: z.iso.date(),
});
export type AnnouncementSummary = z.infer<typeof announcementSummarySchema>;

const titleSchema = z
  .string()
  .trim()
  .min(1, ANNOUNCEMENT_TEXT_REQUIRED)
  .max(ANNOUNCEMENT_TITLE_MAX);
const bodySchema = z
  .string()
  .trim()
  .min(1, ANNOUNCEMENT_TEXT_REQUIRED)
  .max(ANNOUNCEMENT_BODY_MAX);
const writableStatusSchema = z.enum(['draft', 'published']);

export const createAnnouncementSchema = z.object({
  title: titleSchema,
  body: bodySchema,
  tag: announcementTagSchema,
  campusId: idSchema.nullable(),
  pinned: z.boolean().default(false),
  status: writableStatusSchema,
});
export type CreateAnnouncementInput = z.input<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z.object({
  title: titleSchema.optional(),
  body: bodySchema.optional(),
  tag: announcementTagSchema.optional(),
  campusId: idSchema.nullable().optional(),
  pinned: z.boolean().optional(),
  status: writableStatusSchema.optional(),
});
export type UpdateAnnouncementInput = z.input<typeof updateAnnouncementSchema>;

export const pinAnnouncementSchema = z.object({ pinned: z.boolean() });

export const announcementListQuerySchema = z.object({
  status: announcementStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(ANNOUNCEMENT_PAGE_SIZE),
});

export const announcementCountsSchema = z.object({
  published: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  withdrawn: z.number().int().nonnegative(),
});
export type AnnouncementCounts = z.infer<typeof announcementCountsSchema>;

export const announcementListSchema = z.object({
  items: z.array(announcementSchema),
  total: z.number().int().nonnegative(),
  counts: announcementCountsSchema,
});
export type AnnouncementList = z.infer<typeof announcementListSchema>;

export const announcementFeedQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ANNOUNCEMENT_FEED_MAX)
    .default(ANNOUNCEMENT_FEED_DEFAULT),
});
export type AnnouncementFeedQuery = z.output<
  typeof announcementFeedQuerySchema
>;
export type AnnouncementListQuery = z.output<
  typeof announcementListQuerySchema
>;
