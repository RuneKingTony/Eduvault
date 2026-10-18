import { fmtDate } from './date';
import { money } from './naira';

export interface StatementTile {
  label: string;
  value: string;
}

export interface StatementStat {
  label: string;
  value: string;
  sub: string;
}

interface StatementTotalsLike {
  balanceMinor: number;
  paidMinor: number;
  reducedMinor: number;
  totalMinor: number;
}

interface StatementStudentLike {
  admissionNumber: string;
  className: string | null;
  campusName: string;
  archived: boolean;
}

type BalanceKind = 'owing' | 'credit' | 'clear';

export const balanceTone = (balanceMinor: number): 'destructive' | 'success' =>
  balanceMinor > 0 ? 'destructive' : 'success';

export const balanceBadgeVariant = (
  balanceMinor: number
): 'destructive' | 'secondary' | 'success' =>
  balanceMinor < 0 ? 'secondary' : balanceTone(balanceMinor);

function byBalance<T>(
  balanceMinor: number,
  currency: string,
  copy: Record<BalanceKind, (amount: string) => T>
): T {
  if (balanceMinor > 0) {
    return copy.owing(money(balanceMinor, currency));
  }
  return balanceMinor < 0
    ? copy.credit(money(-balanceMinor, currency))
    : copy.clear(money(0, currency));
}

export const balanceTile = (
  balanceMinor: number,
  currency: string
): StatementTile =>
  byBalance(balanceMinor, currency, {
    owing: (amount) => ({ label: 'Owing', value: amount }),
    credit: (amount) => ({ label: 'Extra paid', value: amount }),
    clear: () => ({ label: 'Owing', value: 'Nothing' }),
  });

export function statementTiles(
  totals: StatementTotalsLike,
  currency: string
): StatementTile[] {
  return [
    balanceTile(totals.balanceMinor, currency),
    { label: 'Paid', value: money(totals.paidMinor, currency) },
    ...(totals.reducedMinor > 0
      ? [{ label: 'Reduced', value: money(totals.reducedMinor, currency) }]
      : []),
    { label: 'Total', value: money(totals.totalMinor, currency) },
  ];
}

export const entriesFooter = (
  balanceMinor: number,
  currency: string
): StatementTile =>
  byBalance(balanceMinor, currency, {
    owing: (amount) => ({ label: 'Owing now', value: amount }),
    credit: (amount) => ({ label: 'Extra paid', value: amount }),
    clear: (amount) => ({ label: 'Nothing owing', value: amount }),
  });

export const BROUGHT_FORWARD_LABEL = 'Brought forward';
export const BROUGHT_FORWARD_TIP =
  'What the family already owed before this term.';

interface StatementTermLike {
  term: { fromOn: string; toOn: string | null } | null;
  broughtForward: { amountMinor: number } | null;
  closingMinor: number | null;
}

interface StatementBroughtForward {
  date: string;
  label: string;
  tip: string;
  amount: string;
  tone: 'owe' | 'paid';
}

const broughtForwardAmount = (
  amountMinor: number,
  currency: string
): Pick<StatementBroughtForward, 'amount' | 'tone'> => ({
  amount: byBalance(amountMinor, currency, {
    owing: (amount) => amount,
    credit: (amount) => `${amount} credit`,
    clear: (amount) => amount,
  }),
  tone: amountMinor > 0 ? 'owe' : 'paid',
});

const termFooter = (
  closingMinor: number,
  currency: string,
  ended: boolean
): StatementTile =>
  ended
    ? byBalance(closingMinor, currency, {
        owing: (amount) => ({ label: 'Owing at end of term', value: amount }),
        credit: (amount) => ({
          label: 'Extra paid at end of term',
          value: amount,
        }),
        clear: (amount) => ({
          label: 'Nothing owing at end of term',
          value: amount,
        }),
      })
    : entriesFooter(closingMinor, currency);

export function termStatementView(
  statement: StatementTermLike & { totals: { balanceMinor: number } },
  currency: string
): { broughtForward?: StatementBroughtForward; footer: StatementTile } {
  const { term, broughtForward, closingMinor } = statement;
  if (term === null || broughtForward === null || closingMinor === null) {
    return { footer: entriesFooter(statement.totals.balanceMinor, currency) };
  }
  return {
    broughtForward: {
      date: fmtDate(term.fromOn),
      label: BROUGHT_FORWARD_LABEL,
      tip: BROUGHT_FORWARD_TIP,
      ...broughtForwardAmount(broughtForward.amountMinor, currency),
    },
    footer: termFooter(closingMinor, currency, term.toOn !== null),
  };
}

export function creditCallout(
  creditMinor: number,
  currency: string,
  { canPayBack }: { canPayBack: boolean }
): string {
  const kept = `${money(creditMinor, currency)} was paid in extra. It is taken off the next fees automatically`;
  return canPayBack ? `${kept}, or you can pay it back.` : `${kept}.`;
}

export const statementCallout = (
  balanceMinor: number,
  currency: string,
  options: { canPayBack: boolean }
): { text: string } | undefined =>
  balanceMinor < 0
    ? { text: creditCallout(-balanceMinor, currency, options) }
    : undefined;

export const studentDetail = (student: StatementStudentLike): string =>
  [student.admissionNumber, student.className ?? '—', student.campusName].join(
    ' · '
  ) + (student.archived ? ' · archived' : '');

export function familyTotalSubline(
  owedMinor: number,
  creditMinor: number,
  currency: string
): string {
  const base = owedMinor > 0 ? 'Owed across all children' : 'Nothing owed';
  return creditMinor > 0
    ? `${base} · ${money(creditMinor, currency)} extra paid kept separately`
    : base;
}

export const familyDescription = (children: number): string =>
  `${children} children. Each keeps their own account; this view combines them.`;

export const portalBalanceLine = (
  balanceMinor: number,
  currency: string
): string =>
  byBalance(balanceMinor, currency, {
    owing: (amount) => `${amount} owed`,
    credit: (amount) => `${amount} in credit`,
    clear: () => 'Paid up',
  });

export const feesStat = (
  balanceMinor: number,
  currency: string
): StatementStat =>
  byBalance(balanceMinor, currency, {
    owing: (amount) => ({
      label: 'Owing',
      value: amount,
      sub: 'Still to pay',
    }),
    credit: (amount) => ({
      label: 'School fees',
      value: 'Paid up',
      sub: `${amount} extra`,
    }),
    clear: () => ({
      label: 'School fees',
      value: 'Paid up',
      sub: 'Nothing owed',
    }),
  });

export const feesTile = (
  balanceMinor: number,
  currency: string
): Pick<StatementStat, 'value' | 'sub'> =>
  byBalance(balanceMinor, currency, {
    owing: (amount) => ({ value: amount, sub: 'Owed' }),
    credit: (amount) => ({ value: 'Paid up', sub: `${amount} paid ahead` }),
    clear: () => ({ value: 'Paid up', sub: 'Nothing owed' }),
  });
