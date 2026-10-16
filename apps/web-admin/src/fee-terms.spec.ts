import type { FeeSetupTerm } from '@eduvault/api-contract';
import { chosenTerm, feeTermOptions } from './fee-terms';

const terms: FeeSetupTerm[] = [
  {
    id: 't1',
    name: 'First term',
    schoolYearName: '2026/2027',
    isCurrent: true,
  },
  {
    id: 't2',
    name: 'Second term',
    schoolYearName: '2026/2027',
    isCurrent: false,
  },
];

describe('feeTermOptions', () => {
  it('labels each term with its school year', () => {
    expect(feeTermOptions(terms)).toEqual([
      { id: 't1', label: 'First term, 2026/2027', isCurrent: true },
      { id: 't2', label: 'Second term, 2026/2027', isCurrent: false },
    ]);
  });

  it('offers nothing when the school has no terms', () => {
    expect(feeTermOptions([])).toEqual([]);
  });
});

describe('chosenTerm', () => {
  const options = feeTermOptions(terms);

  it('keeps a wanted term that is offered and falls back to the first', () => {
    expect(chosenTerm(options, 't2')?.id).toBe('t2');
    expect(chosenTerm(options, 'gone')?.id).toBe('t1');
    expect(chosenTerm(options, undefined)?.id).toBe('t1');
    expect(chosenTerm([], 't1')).toBeUndefined();
  });
});
