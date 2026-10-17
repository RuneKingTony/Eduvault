import type { TermChoice } from '@eduvault/api-contract';

export type TermOption = TermChoice;

export function fromOptions(options: readonly TermOption[]): TermOption[] {
  const current = options.findIndex((option) => option.isCurrent);
  return current === -1 ? [...options] : options.slice(current);
}

export function defaultFrom(options: readonly TermOption[]): string {
  const from = fromOptions(options);
  const hasCurrent = options.some((option) => option.isCurrent);
  const pick = hasCurrent ? (from[1] ?? from[0]) : from[0];
  return pick?.id ?? '';
}

export function untilOptions(
  options: readonly TermOption[],
  fromId: string
): TermOption[] {
  const from = options.findIndex((option) => option.id === fromId);
  return from === -1 ? [] : options.slice(from);
}

export function canStillEnd(
  options: readonly TermOption[],
  untilId: string | null
): boolean {
  const known = options.some((term) => term.id === untilId);
  return (
    untilId === null ||
    !known ||
    fromOptions(options).some((term) => term.id === untilId)
  );
}

export function endOptions(
  options: readonly TermOption[],
  untilId: string | null
): TermOption[] {
  const from = fromOptions(options);
  if (untilId === null) {
    return from;
  }
  const last = from.findIndex((option) => option.id === untilId);
  return last === -1 ? from : from.slice(0, last + 1);
}
