import { roundHalfUp } from '@eduvault/shared';

export const receiveValue = (quantity: number, unitCostMinor: number): number =>
  quantity * unitCostMinor;

/** Rounded half up. */
export function averageCost(valueMinor: number, onHand: number): number {
  if (onHand <= 0) {
    return 0;
  }
  return roundHalfUp([valueMinor], onHand);
}

/** Rounded half up, exact where value × quantity passes 2^53. */
export function takeValue(
  valueMinor: number,
  onHand: number,
  quantity: number
): number {
  if (quantity === onHand) {
    return valueMinor;
  }
  return roundHalfUp([valueMinor, quantity], onHand);
}
