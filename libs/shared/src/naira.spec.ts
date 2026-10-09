import { naira, parseNaira } from './naira';

describe('naira', () => {
  it.each([
    [1_234_567, '₦12,345.67'],
    [1_800_000_000, '₦18,000,000'],
    [0, '₦0'],
    [5, '₦0.05'],
    [99_999_999_999, '₦999,999,999.99'],
  ])('formats %i as %s', (minor, expected) => {
    expect(naira(minor)).toBe(expected);
  });

  it('uses a true minus sign, or parentheses on request', () => {
    expect(naira(-500_000)).toBe('−₦5,000');
    expect(naira(-500_000, { paren: true })).toBe('(₦5,000)');
  });

  it('forces kobo and prefixes plus only on positive amounts', () => {
    expect(naira(500_000, { kobo: true })).toBe('₦5,000.00');
    expect(naira(500_000, { plus: true })).toBe('+₦5,000');
    expect(naira(0, { plus: true })).toBe('₦0');
    expect(naira(-500_000, { plus: true })).toBe('−₦5,000');
  });

  it('refuses fractional minor units', () => {
    expect(() => naira(12.5)).toThrow(RangeError);
  });
});

describe('parseNaira', () => {
  it.each([
    ['15,000', 1_500_000],
    ['15000.50', 1_500_050],
    ['15000.5', 1_500_050],
    ['0.07', 7],
    ['1234567.89', 123_456_789],
    ['  200 ', 20_000],
  ])('reads %s as %i minor units', (input, expected) => {
    expect(parseNaira(input)).toBe(expected);
  });

  it.each(['-200', '15000.505', '12abc', 'abc', '', '1.2.3', '1,00', '₦5'])(
    'rejects %j',
    (input) => {
      expect(parseNaira(input)).toBeUndefined();
    }
  );
});
