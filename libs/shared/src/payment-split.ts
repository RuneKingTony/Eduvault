import { money } from './naira';

export function spreadAmount(
  amountMinor: number,
  owedMinor: readonly number[]
): number[] {
  let remaining = Math.max(0, amountMinor);
  const shares = owedMinor.map((owed) => {
    const share = Math.min(remaining, Math.max(0, owed));
    remaining -= share;
    return share;
  });
  const [first] = shares;
  if (first !== undefined) {
    shares[0] = first + remaining;
  }
  return shares;
}

export const totalOwed = (owedMinor: readonly number[]): number =>
  owedMinor.reduce((sum, owed) => sum + Math.max(0, owed), 0);

export interface SplitLine {
  matches: boolean;
  text: string;
}

export interface SplitFigures {
  splitMinor: number;
  amountMinor: number;
  owedMinor: number;
  currency: string;
}

export function splitLine(figures: SplitFigures): SplitLine {
  const { splitMinor, amountMinor, owedMinor, currency } = figures;
  const show = (minor: number) => money(minor, currency);
  if (splitMinor !== amountMinor) {
    return {
      matches: false,
      text: `Split ${show(splitMinor)} ≠ amount ${show(amountMinor)}`,
    };
  }
  const base = `Split ${show(splitMinor)} matches the amount`;
  if (amountMinor < owedMinor) {
    return {
      matches: true,
      text: `${base} · part payment, ${show(owedMinor - amountMinor)} still owed after this`,
    };
  }
  if (amountMinor > owedMinor) {
    return {
      matches: true,
      text: `${base} · ${show(amountMinor - owedMinor)} extra kept as credit`,
    };
  }
  return { matches: true, text: base };
}
