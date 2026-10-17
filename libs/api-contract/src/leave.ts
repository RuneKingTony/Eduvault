import { z } from 'zod';
import { addDays, LEAVE_STATUSES, LEAVE_TYPES } from '@eduvault/shared';
import { dayOffSchema } from './calendar';
import { idSchema } from './schemas';

export const LEAVE_REASON_MAX = 500;
export const LEAVE_COVER_MAX = 200;
export const LEAVE_MAX_SPAN_DAYS = 365;

export const LEAVE_NOT_FOUND_MESSAGE = 'Leave request not found';
export const LEAVE_STAFF_ONLY_MESSAGE =
  'Leave is for staff. Families use the portal.';
export const LEAVE_WITHDRAW_MESSAGE =
  'Only a waiting request can be withdrawn.';
export const LEAVE_FIRST_DAY_MESSAGE = 'Choose the first day of leave.';
export const LEAVE_REASON_MESSAGE = 'Give a reason.';
export const LEAVE_OVERLAP_MESSAGE =
  'You already asked for leave on some of these days.';
export const LEAVE_NO_SCHOOL_DAY_MESSAGE =
  'Those dates are school holidays or a weekend. Choose at least one school day.';
export const LEAVE_END_BEFORE_START_MESSAGE =
  'The last day can’t be before the first day.';
export const LEAVE_TOO_LONG_MESSAGE =
  'Leave can’t run for more than a year. Split it into shorter requests.';
export const LEAVE_PAST_START_MESSAGE = 'The first day can’t be before today.';

export const leaveTypeSchema = z.enum(LEAVE_TYPES);
export const leaveStatusSchema = z.enum(LEAVE_STATUSES);

const dateSchema = z.iso.date();

export const createLeaveSchema = z
  .object({
    type: leaveTypeSchema,
    startsOn: z.iso.date({ error: LEAVE_FIRST_DAY_MESSAGE }),
    endsOn: dateSchema.optional(),
    reason: z
      .string({ error: LEAVE_REASON_MESSAGE })
      .trim()
      .min(1, LEAVE_REASON_MESSAGE)
      .max(LEAVE_REASON_MAX, `Use ${LEAVE_REASON_MAX} characters or fewer.`),
    cover: z
      .string()
      .trim()
      .max(LEAVE_COVER_MAX, `Use ${LEAVE_COVER_MAX} characters or fewer.`)
      .optional(),
  })
  .refine(
    ({ startsOn, endsOn }) => endsOn === undefined || endsOn >= startsOn,
    {
      error: LEAVE_END_BEFORE_START_MESSAGE,
      path: ['endsOn'],
    }
  )
  .refine(
    ({ startsOn, endsOn }) =>
      endsOn === undefined || endsOn <= addDays(startsOn, LEAVE_MAX_SPAN_DAYS),
    { error: LEAVE_TOO_LONG_MESSAGE, path: ['endsOn'] }
  );
export type CreateLeaveInput = z.input<typeof createLeaveSchema>;

export const leaveDtoSchema = z.object({
  id: idSchema,
  createdBy: z.string(),
  requesterName: z.string(),
  type: leaveTypeSchema,
  startsOn: dateSchema,
  endsOn: dateSchema,
  days: z.number().int().nonnegative(),
  reason: z.string(),
  cover: z.string().nullable(),
  status: leaveStatusSchema,
  approvedBy: z.string().nullable(),
  approvedAt: z.iso.datetime({ offset: true }).nullable(),
  rejectedBy: z.string().nullable(),
  rejectedAt: z.iso.datetime({ offset: true }).nullable(),
  deciderName: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  isOwn: z.boolean(),
});
export type LeaveDto = z.infer<typeof leaveDtoSchema>;

export const myLeaveSchema = z.object({
  items: z.array(leaveDtoSchema),
  daysTakenThisYear: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  oldestWaitingSentOn: dateSchema.nullable(),
  nextTimeOff: leaveDtoSchema.nullable(),
  otherApproverExists: z.boolean(),
  schoolYearLabel: z.string().nullable(),
  holidays: z.array(dayOffSchema),
});
export type MyLeave = z.infer<typeof myLeaveSchema>;

export const leaveListQuerySchema = z.object({
  status: z.enum(['submitted', 'all']).default('submitted'),
  userId: z.string().min(1).optional(),
});
export type LeaveListQuery = z.output<typeof leaveListQuerySchema>;
