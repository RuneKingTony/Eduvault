import { walletMoney } from './wallet-money';

describe('walletMoney', () => {
  it('always shows kobo, so zero reads ₦0.00', () => {
    expect(walletMoney(0, 'NGN')).toBe('₦0.00');
    expect(walletMoney(5_000_000, 'NGN')).toBe('₦50,000.00');
    expect(walletMoney(1050, 'NGN')).toBe('₦10.50');
  });

  it('keeps the minus sign for a negative amount', () => {
    expect(walletMoney(-250, 'NGN')).toBe('−₦2.50');
  });
});
