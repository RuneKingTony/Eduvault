import { money } from './naira';

/** A wallet always shows kobo, so an empty one reads ₦0.00 rather than a bare ₦0. */
export const walletMoney = (minor: number, currency: string): string =>
  money(minor, currency, { kobo: true });
