import type { JournalKind } from '@eduvault/api-contract';

export interface LedgerLine {
  ledgerAccountId: string;
  studentId?: string | null;
  familyId?: string | null;
  campusId?: string | null;
  debitMinor: number;
  creditMinor: number;
}

export interface PostInput {
  organizationId: string;
  reference: string;
  kind: JournalKind;
  effectiveOn: string;
  memo?: string | null;
  postedBy: string | null;
  sourceId?: string | null;
  reversesEntryId?: string | null;
  lines: readonly LedgerLine[];
}

export interface PostedEntry {
  id: string;
  reference: string;
  kind: JournalKind;
  effectiveOn: string;
}

export interface PostResult {
  entry: PostedEntry;
  replayed: boolean;
}

/** Thrown where one posting must happen exactly once and its reference already heads another entry. */
export class ReferenceClashError extends Error {
  override readonly name = 'ReferenceClashError';

  constructor(readonly reference: string) {
    super(`Journal reference ${reference} is already used by another entry.`);
  }
}

export class UnbalancedEntryError extends Error {
  override readonly name = 'UnbalancedEntryError';
}

const isMinor = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

function assertLine(line: LedgerLine, index: number): void {
  const { debitMinor, creditMinor } = line;
  if (!isMinor(debitMinor) || !isMinor(creditMinor)) {
    throw new UnbalancedEntryError(
      `Line ${index + 1} must use whole minor units.`
    );
  }
  if (debitMinor > 0 === creditMinor > 0) {
    throw new UnbalancedEntryError(
      `Line ${index + 1} must have either a debit or a credit.`
    );
  }
}

/** The journal triggers are the backstop; this refuses a bad entry before any SQL runs. */
export function assertBalancedLines(lines: readonly LedgerLine[]): void {
  if (lines.length < 2) {
    throw new UnbalancedEntryError('An entry needs at least two lines.');
  }
  for (const [index, line] of lines.entries()) {
    assertLine(line, index);
  }
  const debits = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const credits = lines.reduce((sum, line) => sum + line.creditMinor, 0);
  if (debits !== credits) {
    throw new UnbalancedEntryError('Debits and credits must be equal.');
  }
}

export const clampMemo = (text: string): string => text.slice(0, 500);
