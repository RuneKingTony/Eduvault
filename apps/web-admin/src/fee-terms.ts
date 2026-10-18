import { feeTermLabel, type FeeSetupTerm } from '@eduvault/api-contract';

export interface FeeTermOption {
  id: string;
  label: string;
  isCurrent: boolean;
}

export function feeTermOptions(
  terms: readonly FeeSetupTerm[]
): FeeTermOption[] {
  return terms.map((term) => ({
    id: term.id,
    label: feeTermLabel(term),
    isCurrent: term.isCurrent,
  }));
}

export function chosenTerm(
  options: readonly FeeTermOption[],
  wanted: string | undefined
): FeeTermOption | undefined {
  return options.find((option) => option.id === wanted) ?? options[0];
}
