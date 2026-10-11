import { leavingReasonLabel } from '@eduvault/api-contract';

/** `completed` is only used with a graduation and reads "Completed {level}". */
export const exitReasonLabel = (
  reason: string,
  levelName: string | null
): string =>
  reason === 'completed'
    ? `Completed ${levelName ?? 'final year'}`
    : leavingReasonLabel(reason);
