import {
  DISCOUNT_END_AFTER_UNTIL_MESSAGE,
  DISCOUNT_END_PAST_MESSAGE,
  DISCOUNT_PAST_TERM_MESSAGE,
  DISCOUNT_UNTIL_MESSAGE,
} from '@eduvault/api-contract';
import type { TermPosition } from '../../common/fees';
import { endProblem, fromTermOptions, termsProblem } from './discount-rules';

const term = (year: number, sequence: number): TermPosition => ({
  sessionStartsOn: `${year}-09-01`,
  sequence,
});

const first = term(2026, 1);
const second = term(2026, 2);
const third = term(2026, 3);
const nextYearFirst = term(2027, 1);

describe('termsProblem', () => {
  it('accepts the current term and any later one', () => {
    expect(
      termsProblem({ from: first, to: null, current: first })
    ).toBeUndefined();
    expect(
      termsProblem({ from: nextYearFirst, to: null, current: first })
    ).toBeUndefined();
  });

  it('refuses a From before the current term, comparing the school year first', () => {
    expect(termsProblem({ from: first, to: null, current: second })).toBe(
      DISCOUNT_PAST_TERM_MESSAGE
    );
    expect(
      termsProblem({ from: third, to: null, current: nextYearFirst })
    ).toBe(DISCOUNT_PAST_TERM_MESSAGE);
  });

  it('refuses an Until before From but accepts the same term', () => {
    expect(termsProblem({ from: second, to: first, current: first })).toBe(
      DISCOUNT_UNTIL_MESSAGE
    );
    expect(
      termsProblem({ from: second, to: second, current: first })
    ).toBeUndefined();
  });

  it('accepts any From when no term is current', () => {
    expect(
      termsProblem({ from: first, to: null, current: undefined })
    ).toBeUndefined();
  });
});

describe('endProblem', () => {
  it('accepts the current term up to the existing Until', () => {
    expect(
      endProblem({ last: second, until: third, current: second })
    ).toBeUndefined();
    expect(
      endProblem({ last: third, until: third, current: second })
    ).toBeUndefined();
    expect(
      endProblem({ last: third, until: null, current: second })
    ).toBeUndefined();
  });

  it('refuses a last term before the current term', () => {
    expect(endProblem({ last: first, until: null, current: second })).toBe(
      DISCOUNT_END_PAST_MESSAGE
    );
  });

  it('refuses a last term after the existing Until', () => {
    expect(
      endProblem({ last: nextYearFirst, until: third, current: second })
    ).toBe(DISCOUNT_END_AFTER_UNTIL_MESSAGE);
  });
});

describe('fromTermOptions', () => {
  const terms = [
    { id: 'c', position: nextYearFirst },
    { id: 'a', position: first },
    { id: 'd', position: third },
    { id: 'b', position: second },
  ];

  it('offers the current term and every later one in order', () => {
    expect(fromTermOptions(terms, second).map((option) => option.id)).toEqual([
      'b',
      'd',
      'c',
    ]);
  });

  it('offers every term when none is current', () => {
    expect(fromTermOptions(terms, undefined)).toHaveLength(4);
  });
});
