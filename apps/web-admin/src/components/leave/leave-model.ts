import {
  LEAVE_COVER_MAX,
  LEAVE_END_BEFORE_START_MESSAGE,
  LEAVE_FIRST_DAY_MESSAGE,
  LEAVE_NO_SCHOOL_DAY_MESSAGE,
  LEAVE_PAST_START_MESSAGE,
  LEAVE_REASON_MAX,
  LEAVE_REASON_MESSAGE,
  leaveTypeSchema,
  type CreateLeaveInput,
} from '@eduvault/api-contract';
import { schoolDays } from '@eduvault/shared';

export interface LeaveForm {
  type: string;
  startsOn: string;
  endsOn: string;
  reason: string;
  cover: string;
}

export type LeaveField = 'startsOn' | 'endsOn' | 'reason' | 'cover';
export type LeaveErrors = Partial<Record<LeaveField, string>>;

export const DEFAULT_LEAVE_TYPE = 'annual';

const tooLong = (max: number) => `Use ${max} characters or fewer.`;

function dateErrors(form: LeaveForm, today: string): LeaveErrors {
  if (form.startsOn === '') {
    return { startsOn: LEAVE_FIRST_DAY_MESSAGE };
  }
  if (form.startsOn < today) {
    return { startsOn: LEAVE_PAST_START_MESSAGE };
  }
  if (form.endsOn !== '' && form.endsOn < form.startsOn) {
    return { endsOn: LEAVE_END_BEFORE_START_MESSAGE };
  }
  const endsOn = form.endsOn === '' ? form.startsOn : form.endsOn;
  return schoolDays(form.startsOn, endsOn, []) === 0
    ? { startsOn: LEAVE_NO_SCHOOL_DAY_MESSAGE }
    : {};
}

export function validateLeave(form: LeaveForm, today: string): LeaveErrors {
  const reason = form.reason.trim();
  return {
    ...dateErrors(form, today),
    ...(reason === '' ? { reason: LEAVE_REASON_MESSAGE } : {}),
    ...(reason.length > LEAVE_REASON_MAX
      ? { reason: tooLong(LEAVE_REASON_MAX) }
      : {}),
    ...(form.cover.trim().length > LEAVE_COVER_MAX
      ? { cover: tooLong(LEAVE_COVER_MAX) }
      : {}),
  };
}

export function toLeaveBody(form: LeaveForm): CreateLeaveInput {
  const cover = form.cover.trim();
  return {
    type: leaveTypeSchema.parse(form.type),
    startsOn: form.startsOn,
    ...(form.endsOn === '' ? {} : { endsOn: form.endsOn }),
    reason: form.reason.trim(),
    ...(cover === '' ? {} : { cover }),
  };
}
