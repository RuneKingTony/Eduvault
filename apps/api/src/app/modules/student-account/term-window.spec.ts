import { termOptionsOf, termWindowsOf } from './term-window';

const term = (id: string, sinceDay: string) => ({
  id,
  label: `Term ${id}`,
  sinceDay,
});

describe('termWindowsOf', () => {
  it('ends each window the day before the next opens and leaves the last open', () => {
    const windows = termWindowsOf([
      term('a', '2026-09-01'),
      term('b', '2027-01-05'),
      term('c', '2027-04-20'),
    ]);
    expect(windows.map(({ fromOn, toOn }) => [fromOn, toOn])).toEqual([
      ['2026-09-01', '2027-01-04'],
      ['2027-01-05', '2027-04-19'],
      ['2027-04-20', null],
    ]);
  });

  it('splits the dates with no gap and no overlap', () => {
    const windows = termWindowsOf([
      term('a', '2026-09-01'),
      term('b', '2026-12-30'),
    ]);
    expect(windows[0]?.toOn).toBe('2026-12-29');
    expect(windows[1]?.fromOn).toBe('2026-12-30');
  });

  it('gives a term whose next one opens on or before it an empty window', () => {
    const [first, second] = termWindowsOf([
      term('a', '2026-09-01'),
      term('b', '2026-09-01'),
    ]);
    expect(first?.toOn).toBe('2026-08-31');
    expect((first?.toOn ?? '') < (first?.fromOn ?? '')).toBe(true);
    expect(second?.toOn).toBeNull();
  });

  it('never lets an empty window make its neighbours overlap', () => {
    const [first, second, third] = termWindowsOf([
      term('a', '2026-09-01'),
      term('b', '2026-12-01'),
      term('c', '2026-11-15'),
    ]);
    expect(first?.toOn).toBe('2026-11-14');
    expect(second?.toOn).toBe('2026-11-14');
    expect((second?.toOn ?? '') < (second?.fromOn ?? '')).toBe(true);
    expect(third?.fromOn).toBe('2026-11-15');
  });

  it('is empty with no terms', () => {
    expect(termWindowsOf([])).toEqual([]);
  });
});

describe('termOptionsOf', () => {
  const windows = termWindowsOf([
    term('a', '2026-09-01'),
    term('b', '2027-01-05'),
    term('c', '2027-04-20'),
  ]);

  it('lists the terms opened on or before today, newest first', () => {
    expect(termOptionsOf(windows, '2027-01-05')).toEqual([
      { id: 'b', label: 'Term b' },
      { id: 'a', label: 'Term a' },
    ]);
  });

  it('leaves out a term that has not opened yet', () => {
    expect(termOptionsOf(windows, '2026-08-31')).toEqual([]);
  });
});
