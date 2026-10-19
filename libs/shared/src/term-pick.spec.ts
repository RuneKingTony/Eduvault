import { termKeyOf } from './term-pick';

describe('termKeyOf', () => {
  it('keeps a term id and names the whole history "all"', () => {
    expect(termKeyOf('t1')).toBe('t1');
    expect(termKeyOf(undefined)).toBe('all');
  });
});
