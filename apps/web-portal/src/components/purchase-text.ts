import {
  paymentMethodWord,
  type PaymentMethod,
  type PortalPurchase,
} from '@eduvault/api-contract';
import { countOf, naira } from '@eduvault/shared';

export const paidByLabel = (method: PaymentMethod): string =>
  `Paid by ${paymentMethodWord(method)}`;

export function methodsText(methods: readonly PaymentMethod[]): string {
  const words = methods.map((method) => paymentMethodWord(method));
  const last = words.at(-1);
  if (last === undefined) {
    return '';
  }
  return words.length === 1
    ? last
    : `${words.slice(0, -1).join(', ')} or ${last}`;
}

export const priceText = (minMinor: number, maxMinor: number): string =>
  minMinor === maxMinor
    ? naira(minMinor)
    : `${naira(minMinor)} – ${naira(maxMinor)}`;

export const sizesText = (sizes: readonly string[]): string =>
  sizes.length === 0 ? 'One size' : `Sizes ${sizes.join(', ')}`;

export const termPurchasesNote = (
  count: number,
  termName: string | null
): string =>
  termName === null
    ? countOf(count, 'purchase', 'purchases')
    : `${countOf(count, 'purchase', 'purchases')} in ${termName.toLowerCase()}`;

export const lastPurchaseNote = (
  last: Pick<PortalPurchase, 'totalMinor'> | undefined
): string =>
  last === undefined
    ? 'Nothing yet'
    : `${naira(last.totalMinor)} · paid at the store`;

export const priceListNote = (methods: readonly PaymentMethod[]): string =>
  methods.length === 0
    ? 'Store items are not added to school fees.'
    : `Paid at the store by ${methodsText(methods)}. Store items are not added to school fees.`;
