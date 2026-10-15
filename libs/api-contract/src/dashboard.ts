import { z } from 'zod';
import { moneyAccountKindSchema } from './finance';
import { currencySchema, idSchema } from './schemas';

export const DASHBOARD_SAMPLE_SIZE = 5;
export const ACTIVITY_PAGE_SIZE = 10;

const countSchema = z.number().int().positive();
const nameSchema = z.object({ id: idSchema, name: z.string() });
const samples = <T extends z.ZodType>(item: T) =>
  z.array(item).max(DASHBOARD_SAMPLE_SIZE);

export const dashboardTaskSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dueLeft'),
    count: countSchema,
    students: samples(nameSchema),
  }),
  z.object({
    kind: z.literal('notSeen'),
    count: countSchema,
    students: samples(nameSchema.extend({ notSeenSince: z.iso.date() })),
  }),
  z.object({
    kind: z.literal('notInClass'),
    count: countSchema,
    students: samples(nameSchema),
    startYear: z.object({ name: z.string() }).nullable(),
  }),
  z.object({
    kind: z.literal('noClassTeacher'),
    count: countSchema,
    classes: samples(nameSchema),
  }),
  z.object({
    kind: z.literal('announcementDrafts'),
    count: countSchema,
    titles: samples(z.string()),
  }),
  z.object({
    kind: z.literal('noRole'),
    memberId: idSchema,
    name: z.string(),
  }),
]);
export type DashboardTask = z.infer<typeof dashboardTaskSchema>;

export const dashboardRollSchema = z.object({
  active: z.number().int().nonnegative(),
  newIntakes: z.number().int().nonnegative(),
  inactive: z.number().int().nonnegative(),
  dueLeft: z.number().int().nonnegative(),
  left: z.number().int().nonnegative(),
  leftThisTerm: z.number().int().nonnegative(),
  graduated: z.number().int().nonnegative(),
  campusNames: z.array(z.string()).nullable(),
});
export type DashboardRoll = z.infer<typeof dashboardRollSchema>;

export const myClassSchema = z.object({
  armId: idSchema,
  name: z.string(),
  campusName: z.string(),
  studentCount: z.number().int().nonnegative(),
  isClassTeacher: z.boolean(),
  subjects: z.array(z.string()),
  sampleStudents: samples(nameSchema),
});
export type MyClass = z.infer<typeof myClassSchema>;

export const activityPillarSchema = z.enum([
  'foundation',
  'finance',
  'access',
  'platform',
]);
export type ActivityPillarName = z.infer<typeof activityPillarSchema>;

export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export const activityItemSchema = z.object({
  id: idSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  pillar: activityPillarSchema,
  text: z.string(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const activityPageSchema = z.object({
  items: z.array(activityItemSchema),
  total: z.number().int().nonnegative(),
});
export type ActivityPage = z.infer<typeof activityPageSchema>;

export const dashboardMoneySchema = z.object({
  currency: currencySchema,
  totalMinor: z.number().int(),
  accounts: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      kind: moneyAccountKindSchema,
      campusName: z.string().nullable(),
      last4: z.string().nullable(),
      balanceMinor: z.number().int(),
    })
  ),
  hiddenSchoolWide: z.number().int().nonnegative(),
});
export type DashboardMoney = z.infer<typeof dashboardMoneySchema>;
