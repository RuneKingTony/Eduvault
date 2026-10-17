import {
  DISCOUNT_END_AFTER_UNTIL_MESSAGE,
  DISCOUNT_END_PAST_MESSAGE,
  DISCOUNT_PAST_TERM_MESSAGE,
  DISCOUNT_UNTIL_MESSAGE,
} from '@eduvault/api-contract';
import { compareTerms, type TermPosition } from '../../common/fees';

interface TermRange {
  from: TermPosition;
  to: TermPosition | null;
  current: TermPosition | undefined;
}

export function termsProblem({
  from,
  to,
  current,
}: TermRange): string | undefined {
  if (current !== undefined && compareTerms(from, current) < 0) {
    return DISCOUNT_PAST_TERM_MESSAGE;
  }
  if (to !== null && compareTerms(to, from) < 0) {
    return DISCOUNT_UNTIL_MESSAGE;
  }
  return undefined;
}

interface EndTerms {
  last: TermPosition;
  until: TermPosition | null;
  current: TermPosition | undefined;
}

export function endProblem({
  last,
  until,
  current,
}: EndTerms): string | undefined {
  if (current !== undefined && compareTerms(last, current) < 0) {
    return DISCOUNT_END_PAST_MESSAGE;
  }
  if (until !== null && compareTerms(last, until) > 0) {
    return DISCOUNT_END_AFTER_UNTIL_MESSAGE;
  }
  return undefined;
}

export function fromTermOptions<T extends { position: TermPosition }>(
  terms: readonly T[],
  current: TermPosition | undefined
): T[] {
  return terms
    .filter(
      (term) =>
        current === undefined || compareTerms(term.position, current) >= 0
    )
    .toSorted((a, b) => compareTerms(a.position, b.position));
}
