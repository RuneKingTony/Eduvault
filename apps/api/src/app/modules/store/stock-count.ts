import { averageCost, takeValue } from './stock-value';

export interface CountLineFacts {
  itemId: string;
  displayName: string;
  expectedQuantity: number;
  countedQuantity: number;
  costPriceMinor: number;
}

export interface StockLevel {
  onHand: number;
  valueMinor: number;
}

export interface CountMovement {
  itemId: string;
  quantity: number;
  /** Signed like the movement: a shortage takes value out. */
  valueMinor: number;
}

export type ApprovalPlan =
  | { status: 'ready'; movements: CountMovement[]; netMinor: number }
  | { status: 'moved' };

export const lineDifference = (
  line: Pick<CountLineFacts, 'expectedQuantity' | 'countedQuantity'>
): number => line.countedQuantity - line.expectedQuantity;

const unitValue = (stock: StockLevel, costPriceMinor: number): number =>
  stock.onHand > 0
    ? averageCost(stock.valueMinor, stock.onHand)
    : costPriceMinor;

/** What a difference is worth at the average, never negative; a shortage never takes more than is held. */
export function differenceValue(
  difference: number,
  stock: StockLevel,
  costPriceMinor: number
): number {
  if (difference < 0) {
    return stock.onHand > 0
      ? takeValue(
          stock.valueMinor,
          stock.onHand,
          Math.min(-difference, stock.onHand)
        )
      : 0;
  }
  return difference * unitValue(stock, costPriceMinor);
}

export function netValue(
  lines: readonly { difference: number; valueMinor: number }[]
): number {
  let net = 0;
  for (const line of lines) {
    net += line.difference < 0 ? line.valueMinor : -line.valueMinor;
  }
  return net;
}

export function differencesSummary(
  lines: readonly { displayName: string; difference: number }[]
): string {
  const parts = lines
    .filter((line) => line.difference !== 0)
    .map(
      (line) =>
        `${line.displayName}: ${Math.abs(line.difference)} ${line.difference < 0 ? 'missing' : 'extra'}`
    );
  return parts.length === 0 ? 'matches' : parts.join('; ');
}

export const NO_STOCK: StockLevel = { onHand: 0, valueMinor: 0 };

export function approvalPlan(
  lines: readonly CountLineFacts[],
  stock: ReadonlyMap<string, StockLevel>
): ApprovalPlan {
  const movements: CountMovement[] = [];
  const priced: { difference: number; valueMinor: number }[] = [];
  for (const line of lines) {
    const difference = lineDifference(line);
    if (difference === 0) {
      continue;
    }
    const level = stock.get(line.itemId) ?? NO_STOCK;
    if (level.onHand + difference < 0) {
      return { status: 'moved' };
    }
    const value = differenceValue(difference, level, line.costPriceMinor);
    priced.push({ difference, valueMinor: value });
    movements.push({
      itemId: line.itemId,
      quantity: difference,
      valueMinor: difference < 0 ? -value : value,
    });
  }
  return { status: 'ready', movements, netMinor: netValue(priced) };
}
