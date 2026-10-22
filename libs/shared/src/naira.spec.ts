import {
  groupedNairaInputText,
  nairaInputText,
  money,
  naira,
  parseNaira,
} from './naira';

describe('money', () => {
  it('uses the naira sign for NGN and the code for any other currency', () => {
    expect(money(1_250_000, 'NGN')).toBe('₦12,500');
    expect(money(1_250_050, 'USD')).toBe('USD 12,500.50');
    expect(money(-500_000, 'GBP', { paren: true })).toBe('(GBP 5,000)');
  });

  it('refuses fractional minor units', () => {
    expect(() => money(12.5, 'USD')).toThrow(RangeError);
  });
});

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

describe('nairaInputText', () => {
  it.each([
    [18_000_000, '180000'],
    [150_050, '1500.50'],
    [150_005, '1500.05'],
    [5, '0.05'],
    [50, '0.50'],
    [0, '0'],
  ])('writes %i minor units as %s', (minor, text) => {
    expect(nairaInputText(minor)).toBe(text);
  });

  it('writes a negative with a sign instead of a broken fraction', () => {
    expect(nairaInputText(-50)).toBe('-0.50');
    expect(nairaInputText(-150_050)).toBe('-1500.50');
  });

  it('refuses a fractional or unsafe amount', () => {
    expect(() => nairaInputText(1.5)).toThrow(RangeError);
    expect(() => nairaInputText(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError
    );
  });

  it('reads back through parseNaira to the same minor units', () => {
    for (const minor of [0, 1, 5, 99, 100, 101, 150_050, 12_345_678_901]) {
      expect(parseNaira(nairaInputText(minor))).toBe(minor);
      expect(parseNaira(groupedNairaInputText(minor))).toBe(minor);
    }
  });
});

describe('groupedNairaInputText', () => {
  it('groups the thousands and leaves the sign off', () => {
    expect(groupedNairaInputText(1_500_000)).toBe('15,000');
    expect(groupedNairaInputText(1_500_050)).toBe('15,000.50');
    expect(groupedNairaInputText(99)).toBe('0.99');
  });
});
