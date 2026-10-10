import { z } from 'zod';
import { HOLIDAY_NAME_REQUIRED, idSchema } from './schemas';

const dateSchema = z.iso.date();

export const SCHOOL_YEAR_PAGE_SIZE = 10;

export const holidaySchema = z.object({
  id: idSchema,
  termId: idSchema,
  date: dateSchema,
  name: z.string(),
});
export type Holiday = z.infer<typeof holidaySchema>;

export const termSchema = z.object({
  id: idSchema,
  schoolYearId: idSchema,
  sequence: z.number().int().min(1).max(3),
  name: z.string(),
  startsOn: dateSchema,
  endsOn: dateSchema,
  isCurrent: z.boolean(),
  ended: z.boolean(),
  schoolDays: z.number().int().nonnegative(),
  holidayCount: z.number().int().nonnegative(),
  holidays: z.array(holidaySchema),
  canMakeCurrent: z.boolean(),
});
export type Term = z.infer<typeof termSchema>;

export const schoolYearSchema = z.object({
  id: idSchema,
  name: z.string(),
  startsOn: dateSchema,
  endsOn: dateSchema,
  terms: z.array(termSchema),
  deletable: z.object({ ok: z.boolean(), reason: z.string().nullable() }),
  studentsWaiting: z.number().int().nonnegative().nullable(),
});
export type SchoolYear = z.infer<typeof schoolYearSchema>;

export const schoolYearListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export const schoolYearListSchema = z.object({
  items: z.array(schoolYearSchema),
  total: z.number().int().nonnegative(),
});
export type SchoolYearList = z.infer<typeof schoolYearListSchema>;

export const createSchoolYearSchema = z.object({
  name: z.string().trim(),
  startsOn: dateSchema,
  endsOn: dateSchema,
});
export type CreateSchoolYearInput = z.input<typeof createSchoolYearSchema>;

export const createdSchoolYearSchema = schoolYearSchema.extend({
  madeCurrent: z.boolean(),
});
export type CreatedSchoolYear = z.infer<typeof createdSchoolYearSchema>;

export const updateTermSchema = z.object({
  startsOn: dateSchema.optional(),
  endsOn: dateSchema.optional(),
});
export type UpdateTermInput = z.input<typeof updateTermSchema>;

export const createHolidaySchema = z.object({
  date: dateSchema,
  name: z
    .string({ error: HOLIDAY_NAME_REQUIRED })
    .trim()
    .min(1, HOLIDAY_NAME_REQUIRED)
    .max(100, 'Use 100 characters or fewer.'),
});
export type CreateHolidayInput = z.input<typeof createHolidaySchema>;

export const holidayAddedSchema = z.object({
  holiday: holidaySchema,
  term: termSchema,
});
export type HolidayAdded = z.infer<typeof holidayAddedSchema>;

export const holidayRemovedSchema = z.object({
  id: idSchema,
  term: termSchema,
});
export type HolidayRemoved = z.infer<typeof holidayRemovedSchema>;

export const calendarCurrentSchema = z.object({
  term: termSchema.nullable(),
  schoolYear: z
    .object({
      id: idSchema,
      name: z.string(),
      startsOn: dateSchema,
      endsOn: dateSchema,
    })
    .nullable(),
  schoolDays: z.number().int().nonnegative(),
  schoolDaysSoFar: z.number().int().nonnegative(),
});
export type CalendarCurrent = z.infer<typeof calendarCurrentSchema>;

export const dayOffSchema = z.object({
  kind: z.enum(['holiday', 'break']),
  name: z.string(),
  start: dateSchema,
  end: dateSchema,
  days: z.number().int().nonnegative(),
  resume: dateSchema.optional(),
});
export type DayOffEntry = z.infer<typeof dayOffSchema>;

export const daysOffQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(4),
});
