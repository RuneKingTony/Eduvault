export interface TermPick {
  term: string | undefined;
  onTerm: (term: string | undefined) => void;
}

export const termKeyOf = (termId: string | undefined): string =>
  termId ?? 'all';
