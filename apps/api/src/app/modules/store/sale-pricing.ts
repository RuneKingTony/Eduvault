import { takeValue } from './stock-value';
import type { SaleLineRequest } from './sale.repository';

export interface PricedLine extends SaleLineRequest {
  amountMinor: number;
  costMinor: number;
}

type SalePricing =
  | {
      status: 'priced';
      lines: PricedLine[];
      totalMinor: number;
      costMinor: number;
    }
  | { status: 'short'; itemName: string; onHand: number };

export function priceSale(
  lines: readonly SaleLineRequest[],
  stock: ReadonlyMap<string, { onHand: number; valueMinor: number }>
): SalePricing {
  const priced: PricedLine[] = [];
  for (const line of lines) {
    const held = stock.get(line.itemId) ?? { onHand: 0, valueMinor: 0 };
    if (held.onHand < line.quantity) {
      return {
        status: 'short',
        itemName: line.displayName,
        onHand: Math.max(held.onHand, 0),
      };
    }
    priced.push({
      ...line,
      amountMinor: line.unitPriceMinor * line.quantity,
      costMinor: takeValue(held.valueMinor, held.onHand, line.quantity),
    });
  }
  const sum = (pick: (line: PricedLine) => number) =>
    priced.reduce((total, line) => total + pick(line), 0);
  return {
    status: 'priced',
    lines: priced,
    totalMinor: sum((line) => line.amountMinor),
    costMinor: sum((line) => line.costMinor),
  };
}
