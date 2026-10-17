export const receiveValue = (quantity: number, unitCostMinor: number): number =>
  quantity * unitCostMinor;

/** Rounded half up. */
export function averageCost(valueMinor: number, onHand: number): number {
  if (onHand <= 0) {
    return 0;
  }
  return Math.floor((2 * valueMinor + onHand) / (2 * onHand));
}
