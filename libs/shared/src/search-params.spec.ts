import { oneOf, pageOf, textOf } from './search-params';

describe('search params', () => {
  it('reads text from strings and numbers, trimmed', () => {
    expect(textOf(' abc ')).toBe('abc');
    expect(textOf(12)).toBe('12');
    expect(textOf('  ')).toBeUndefined();
    expect(textOf({})).toBeUndefined();
  });

  it('keeps only pages after the first', () => {
    expect(pageOf('3')).toBe(3);
    expect(pageOf(1)).toBeUndefined();
    expect(pageOf('x')).toBeUndefined();
  });

  it('matches one of the options', () => {
    expect(oneOf(['a', 'b'] as const, 'b')).toBe('b');
    expect(oneOf(['a', 'b'] as const, 'c')).toBeUndefined();
  });
});
