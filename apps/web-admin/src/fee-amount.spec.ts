import { amountInputText, parseFeeAmount } from './fee-amount';

describe('parseFeeAmount', () => {
  it('reads naira with or without the sign and the grouping', () => {
    expect(parseFeeAmount('₦15,000')).toBe(1_500_000);
    expect(parseFeeAmount('15,000')).toBe(1_500_000);
    expect(parseFeeAmount(' 15000 ')).toBe(1_500_000);
    expect(parseFeeAmount('₦ 180,000')).toBe(18_000_000);
  });

  it('keeps kobo exact', () => {
    expect(parseFeeAmount('15,000.5')).toBe(1_500_050);
    expect(parseFeeAmount('0.07')).toBe(7);
  });

  it('gives undefined for empty, zero, text and negative amounts', () => {
    for (const input of [
      '',
      '   ',
      '0',
      '₦0.00',
      'abc',
      '-5',
      '1,00',
      '1.234',
    ]) {
      expect(parseFeeAmount(input)).toBeUndefined();
    }
  });
});

describe('amountInputText', () => {
  it('groups the naira and leaves the sign off', () => {
    expect(amountInputText(1_500_000)).toBe('15,000');
    expect(amountInputText(1_500_050)).toBe('15,000.50');
  });
});
