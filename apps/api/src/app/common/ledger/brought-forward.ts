export interface ReceivableMovement {
  sequence: number;
  netMinor: number;
}

interface DatedMovement {
  effectiveOn: string;
  netMinor: number;
}

export const balanceToday = (
  movements: readonly { netMinor: number }[]
): number => movements.reduce((sum, movement) => sum + movement.netMinor, 0);

export const broughtForward = (
  movements: readonly ReceivableMovement[],
  entrySequence: number
): number =>
  balanceToday(
    movements.filter((movement) => movement.sequence < entrySequence)
  );

/** Keyed on the day, not `sequence`, because the statement orders by date. */
export const broughtForwardBefore = (
  movements: readonly DatedMovement[],
  fromDay: string
): number =>
  balanceToday(movements.filter((movement) => movement.effectiveOn < fromDay));

export function termSlice<T extends DatedMovement>(
  movements: readonly T[],
  window: { fromOn: string; toOn: string | null }
): { broughtForwardMinor: number; inTerm: T[]; closingMinor: number } {
  const inTerm = movements.filter(
    ({ effectiveOn }) =>
      effectiveOn >= window.fromOn &&
      (window.toOn === null || effectiveOn <= window.toOn)
  );
  const broughtForwardMinor = broughtForwardBefore(movements, window.fromOn);
  return {
    broughtForwardMinor,
    inTerm,
    closingMinor: broughtForwardMinor + balanceToday(inTerm),
  };
}
