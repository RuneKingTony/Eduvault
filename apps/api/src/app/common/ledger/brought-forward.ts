export interface ReceivableMovement {
  sequence: number;
  netMinor: number;
}

export const balanceToday = (
  movements: readonly ReceivableMovement[]
): number => movements.reduce((sum, movement) => sum + movement.netMinor, 0);

export const broughtForward = (
  movements: readonly ReceivableMovement[],
  entrySequence: number
): number =>
  balanceToday(
    movements.filter((movement) => movement.sequence < entrySequence)
  );
