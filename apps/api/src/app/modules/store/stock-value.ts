export const receiveValue = (quantity: number, unitCostMinor: number): number =>
  quantity * unitCostMinor;

/** Rounded half up. */
export function averageCost(valueMinor: number, onHand: number): number {
  if (onHand <= 0) {
    return 0;
  }
  return Math.floor((2 * valueMinor + onHand) / (2 * onHand));
}

/** Rounded half up. BigInt, because value × quantity can pass 2^53. */
export function takeValue(
  valueMinor: number,
  onHand: number,
  quantity: number
): number {
  if (quantity === onHand) {
    return valueMinor;
  }
  const scaled = 2n * BigInt(valueMinor) * BigInt(quantity) + BigInt(onHand);
  return Number(scaled / (2n * BigInt(onHand)));
}
