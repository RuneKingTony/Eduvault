import { addDays } from '@eduvault/shared';
import type { TermStart } from './student-account.repository';

export interface TermWindow {
  id: string;
  label: string;
  fromOn: string;
  toOn: string | null;
}

/** Ends the day before the earliest later opening, so windows never overlap. */
export function termWindowsOf(terms: readonly TermStart[]): TermWindow[] {
  let nextOpening: string | null = null;
  const windows: TermWindow[] = [];
  for (const term of terms.toReversed()) {
    windows.push({
      id: term.id,
      label: term.label,
      fromOn: term.sinceDay,
      toOn: nextOpening === null ? null : addDays(nextOpening, -1),
    });
    if (nextOpening === null || term.sinceDay < nextOpening) {
      nextOpening = term.sinceDay;
    }
  }
  return windows.toReversed();
}

export const termOptionsOf = (
  windows: readonly TermWindow[],
  today: string
): { id: string; label: string }[] =>
  windows
    .filter(({ fromOn }) => fromOn <= today)
    .toReversed()
    .map(({ id, label }) => ({ id, label }));
