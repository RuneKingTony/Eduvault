import type { SchoolYear } from '@eduvault/api-contract';

export interface FeeTermOption {
  id: string;
  label: string;
  isCurrent: boolean;
}

export function feeTermOptions(years: readonly SchoolYear[]): FeeTermOption[] {
  const terms = years
    .toSorted((a, b) => a.startsOn.localeCompare(b.startsOn))
    .flatMap((year) =>
      year.terms
        .toSorted((a, b) => a.sequence - b.sequence)
        .map((term) => ({
          id: term.id,
          label: `${term.name}, ${year.name}`,
          isCurrent: term.isCurrent,
        }))
    );
  const at = terms.findIndex((term) => term.isCurrent);
  return at === -1 ? [] : terms.slice(at, at + 2);
}

export function chosenTerm(
  options: readonly FeeTermOption[],
  wanted: string | undefined
): FeeTermOption | undefined {
  return options.find((option) => option.id === wanted) ?? options[0];
}
