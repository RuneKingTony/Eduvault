const EXIT_REASON_LABELS: Record<string, string> = {
  did_not_return: 'Did not return',
  relocated: 'Relocated',
  transferred: 'Transferred to another school',
  fees: 'Fees',
  expelled: 'Expelled',
  other: 'Other',
};

/** `completed` is only used with a graduation and reads "Completed {level}". */
export const exitReasonLabel = (
  reason: string,
  levelName: string | null
): string =>
  reason === 'completed'
    ? `Completed ${levelName ?? 'final year'}`
    : (EXIT_REASON_LABELS[reason] ?? 'Other');
