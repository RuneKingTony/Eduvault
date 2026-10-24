import {
  WALLET_AMOUNT_MESSAGE,
  walletSpendOverMessage,
  type SpendLine,
  type Wallet,
  type WalletChild,
} from '@eduvault/api-contract';
import {
  nairaInputText,
  oldestFirst,
  parseNaira,
  payAllICan,
  payTableRows,
} from '@eduvault/shared';

export interface PayRow {
  studentId: string;
  name: string;
  owedMinor: number;
  capMinor: number;
  text: string;
  amountMinor: number;
  issue: string | null;
}

export interface PayModel {
  rows: PayRow[];
  lines: SpendLine[];
  totalMinor: number;
  issue: string | null;
}

export type PayTexts = Readonly<Record<string, string>>;

const amountOf = (text: string): number | undefined =>
  text.trim() === '' ? 0 : parseNaira(text);

function rowIssue(
  child: WalletChild,
  amountMinor: number | undefined,
  capMinor: number
): string | null {
  if (amountMinor === undefined) {
    return WALLET_AMOUNT_MESSAGE;
  }
  return amountMinor > capMinor
    ? walletSpendOverMessage(child.name, capMinor)
    : null;
}

export function payModel(wallet: Wallet, texts: PayTexts): PayModel {
  const children = oldestFirst(wallet.children);
  const parsed = children.map((child) =>
    amountOf(texts[child.studentId] ?? '')
  );
  const caps = payTableRows(
    children,
    Object.fromEntries(
      children.map((child, index) => [child.studentId, parsed[index] ?? 0])
    ),
    wallet.freeMinor
  );
  const rows = children.map((child, index): PayRow => {
    const amountMinor = parsed[index];
    const capMinor = caps[index]?.capMinor ?? 0;
    return {
      studentId: child.studentId,
      name: child.name,
      owedMinor: Math.max(0, child.owedMinor),
      capMinor,
      text: texts[child.studentId] ?? '',
      amountMinor: amountMinor ?? 0,
      issue: rowIssue(child, amountMinor, capMinor),
    };
  });
  const lines = rows
    .filter((row) => row.issue === null && row.amountMinor > 0)
    .map((row) => ({ studentId: row.studentId, amountMinor: row.amountMinor }));
  return {
    rows,
    lines,
    totalMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0),
    issue: rows.find((row) => row.issue !== null)?.issue ?? null,
  };
}

export function payAllTexts(wallet: Wallet): Record<string, string> {
  const lines = payAllICan(oldestFirst(wallet.children), wallet.freeMinor);
  return Object.fromEntries(
    lines.map((line) => [line.studentId, nairaInputText(line.amountMinor)])
  );
}
