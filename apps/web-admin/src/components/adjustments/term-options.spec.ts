import type { TermChoice } from '@eduvault/api-contract';
import {
  canStillEnd,
  defaultFrom,
  endOptions,
  fromOptions,
  untilOptions,
} from './term-options';

const term = (id: string, label: string, startsOn: string): TermChoice => ({
  id,
  label,
  startsOn,
  isCurrent: false,
});

const years = [
  term('t1', 'First term, 2026/2027', '2026-09-07'),
  { ...term('t2', 'Second term, 2026/2027', '2027-01-11'), isCurrent: true },
  term('t3', 'Third term, 2026/2027', '2027-04-20'),
  term('t4', 'First term, 2027/2028', '2027-09-05'),
];

describe('fromOptions and defaultFrom', () => {
  const options = years;

  it('offers the current term and every later one', () => {
    expect(fromOptions(options).map((option) => option.id)).toEqual([
      't2',
      't3',
      't4',
    ]);
  });

  it('defaults to the term after the current one', () => {
    expect(defaultFrom(options)).toBe('t3');
  });

  it('defaults to the current term when it is the last that exists', () => {
    expect(
      defaultFrom(
        options.filter((option) => option.id !== 't3' && option.id !== 't4')
      )
    ).toBe('t2');
  });

  it('offers every term and the first when none is current', () => {
    const none = options.map((option) => ({ ...option, isCurrent: false }));
    expect(fromOptions(none)).toHaveLength(4);
    expect(defaultFrom(none)).toBe('t1');
    expect(defaultFrom([])).toBe('');
  });
});

describe('untilOptions', () => {
  it('starts at the From term', () => {
    expect(untilOptions(years, 't3').map((option) => option.id)).toEqual([
      't3',
      't4',
    ]);
    expect(untilOptions(years, 'gone')).toEqual([]);
  });
});

describe('endOptions', () => {
  const options = years;

  it('offers the current term onward when the discount has no end', () => {
    expect(endOptions(options, null).map((option) => option.id)).toEqual([
      't2',
      't3',
      't4',
    ]);
  });

  it('stops at the discount’s existing Until', () => {
    expect(endOptions(options, 't3').map((option) => option.id)).toEqual([
      't2',
      't3',
    ]);
  });

  it('ignores an Until that is already behind the current term', () => {
    expect(endOptions(options, 't1').map((option) => option.id)).toEqual([
      't2',
      't3',
      't4',
    ]);
  });
});

describe('canStillEnd', () => {
  const options = years;

  it('is open for a discount with no Until and for one that ends this term or later', () => {
    expect(canStillEnd(options, null)).toBe(true);
    expect(canStillEnd(options, 't2')).toBe(true);
    expect(canStillEnd(options, 't4')).toBe(true);
  });

  it('is closed once the Until term is before the current one', () => {
    expect(canStillEnd(options, 't1')).toBe(false);
  });

  it('stays open for a term the calendar does not list', () => {
    expect(canStillEnd(options, 'unknown')).toBe(true);
  });
});
