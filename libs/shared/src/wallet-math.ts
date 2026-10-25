export interface WalletFigures {
  balanceMinor: number;
  setAsideMinor: number;
  heldMinor: number;
  freeMinor: number;
}

export function walletFigures(
  balanceMinor: number,
  earmarksMinor: readonly number[],
  heldMinor: number
): WalletFigures {
  const setAsideMinor = earmarksMinor.reduce((sum, mark) => sum + mark, 0);
  return {
    balanceMinor,
    setAsideMinor,
    heldMinor,
    freeMinor: balanceMinor - setAsideMinor - heldMinor,
  };
}

export interface ChildWalletFigures {
  owedMinor: number;
  earmarkMinor: number;
}

export function childSpendable(
  child: ChildWalletFigures,
  freeMinor: number
): number {
  const available = child.earmarkMinor + Math.max(0, freeMinor);
  return Math.max(0, Math.min(child.owedMinor, available));
}

export interface SpendRequestLine {
  studentId: string;
  amountMinor: number;
}

export interface SpendChild extends ChildWalletFigures {
  studentId: string;
}

export interface SpendSplit extends SpendRequestLine {
  fromEarmarkMinor: number;
  fromFreeMinor: number;
}

export type SpendAllocation =
  | { ok: true; lines: SpendSplit[] }
  | { ok: false; studentId: string; spendableMinor: number };

export function allocateSpend(
  lines: readonly SpendRequestLine[],
  children: readonly SpendChild[],
  freeMinor: number
): SpendAllocation {
  const byStudent = new Map(children.map((child) => [child.studentId, child]));
  let freeLeftMinor = freeMinor;
  const split: SpendSplit[] = [];
  for (const line of lines) {
    const child = byStudent.get(line.studentId);
    const spendableMinor =
      child === undefined ? 0 : childSpendable(child, freeLeftMinor);
    if (child === undefined || line.amountMinor > spendableMinor) {
      return { ok: false, studentId: line.studentId, spendableMinor };
    }
    const fromEarmarkMinor = Math.min(line.amountMinor, child.earmarkMinor);
    const fromFreeMinor = line.amountMinor - fromEarmarkMinor;
    freeLeftMinor -= fromFreeMinor;
    split.push({ ...line, fromEarmarkMinor, fromFreeMinor });
  }
  return { ok: true, lines: split };
}
