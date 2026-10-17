import {
  SALE_METHOD_ORDER,
  booksForLevel,
  isSellable,
  type PaymentMethods,
  type PortalPriceList,
} from '@eduvault/api-contract';
import type { ItemRecord } from './store.repository';

interface PriceListInput {
  items: readonly ItemRecord[];
  levelId: string | null;
  levelName: string | null;
  onHand: ReadonlyMap<string, number>;
  methods: PaymentMethods;
}

const inStock = (onHand: ReadonlyMap<string, number>, item: ItemRecord) =>
  (onHand.get(item.id) ?? 0) > 0;

const bySize = (a: string, b: string): number =>
  a.length - b.length || a.localeCompare(b);

function uniformsOf(
  items: readonly ItemRecord[],
  onHand: ReadonlyMap<string, number>
): PortalPriceList['uniforms'] {
  const byName = new Map<string, ItemRecord[]>();
  for (const item of items.filter((row) => row.kind === 'uniform')) {
    byName.set(item.name, [...(byName.get(item.name) ?? []), item]);
  }
  return [...byName]
    .map(([name, sizes]) => {
      const prices = sizes.map((item) => item.sellPriceMinor);
      return {
        name,
        sizes: sizes
          .flatMap((item) => (item.variant === null ? [] : [item.variant]))
          .toSorted(bySize),
        minPriceMinor: Math.min(...prices),
        maxPriceMinor: Math.max(...prices),
        inStock: sizes.some((item) => inStock(onHand, item)),
      };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

export function buildPriceList(input: PriceListInput): PortalPriceList {
  const live = input.items.filter((item) => isSellable(item));
  return {
    levelName: input.levelName,
    books: booksForLevel(live, input.levelId)
      .map((item) => ({
        name: item.name,
        priceMinor: item.sellPriceMinor,
        inStock: inStock(input.onHand, item),
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
    uniforms: uniformsOf(live, input.onHand),
    paymentMethods: SALE_METHOD_ORDER.filter((method) => input.methods[method]),
  };
}
