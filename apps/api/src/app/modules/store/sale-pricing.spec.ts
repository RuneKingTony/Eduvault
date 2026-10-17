import { priceSale } from './sale-pricing';

const line = (itemId: string, quantity: number, unitPriceMinor = 450_000) => ({
  itemId,
  displayName: `Item ${itemId}`,
  quantity,
  unitPriceMinor,
});

describe('priceSale', () => {
  it('freezes the price and takes the cost at the average of the stock held', () => {
    const stock = new Map([['shirt', { onHand: 20, valueMinor: 6_500_000 }]]);
    expect(priceSale([line('shirt', 2)], stock)).toEqual({
      status: 'priced',
      lines: [
        { ...line('shirt', 2), amountMinor: 900_000, costMinor: 650_000 },
      ],
      totalMinor: 900_000,
      costMinor: 650_000,
    });
  });

  it('gives the last units whatever value is left', () => {
    const stock = new Map([['tie', { onHand: 3, valueMinor: 1_000_000 }]]);
    const first = priceSale([line('tie', 1)], stock);
    expect(first).toMatchObject({ costMinor: 333_333 });
    const rest = priceSale(
      [line('tie', 2)],
      new Map([['tie', { onHand: 2, valueMinor: 666_667 }]])
    );
    expect(rest).toMatchObject({ costMinor: 666_667 });
  });

  it('adds up several lines', () => {
    const stock = new Map([
      ['a', { onHand: 4, valueMinor: 400 }],
      ['b', { onHand: 2, valueMinor: 300 }],
    ]);
    expect(
      priceSale([line('a', 2, 500), line('b', 1, 700)], stock)
    ).toMatchObject({
      totalMinor: 1700,
      costMinor: 350,
    });
  });

  it('names the first line the shelf cannot cover', () => {
    const stock = new Map([
      ['a', { onHand: 5, valueMinor: 500 }],
      ['b', { onHand: 1, valueMinor: 100 }],
    ]);
    expect(priceSale([line('a', 1), line('b', 3)], stock)).toEqual({
      status: 'short',
      itemName: 'Item b',
      onHand: 1,
    });
  });

  it('treats an item with no movements, or stock below zero, as nothing left', () => {
    expect(priceSale([line('none', 1)], new Map())).toEqual({
      status: 'short',
      itemName: 'Item none',
      onHand: 0,
    });
    expect(
      priceSale(
        [line('neg', 1)],
        new Map([['neg', { onHand: -2, valueMinor: 0 }]])
      )
    ).toMatchObject({ status: 'short', onHand: 0 });
  });
});
