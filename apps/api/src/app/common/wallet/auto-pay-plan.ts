import { createHash } from 'node:crypto';
import {
  SYSTEM_REFERENCE_PREFIXES,
  oldestFirst,
  payAllICan,
  type PayTableChild,
  type SpendRequestLine,
} from '@eduvault/shared';

const REFERENCE_MAX = 80;
const PREFIX = `${SYSTEM_REFERENCE_PREFIXES.autopay}-`;

/** The spend an auto-pay makes is named after the credit that triggered it, so a replayed credit finds its spend. A long credit reference is hashed to fit the column. */
export function autoPayReference(creditReference: string): string {
  const direct = `${PREFIX}${creditReference}`;
  if (direct.length <= REFERENCE_MAX) {
    return direct;
  }
  const digest = createHash('sha256').update(creditReference).digest('hex');
  return `${PREFIX}${digest}`;
}

export function planAutoPay(
  children: readonly PayTableChild[],
  freeMinor: number
): SpendRequestLine[] {
  return payAllICan(
    oldestFirst(children.filter((child) => child.owedMinor > 0)),
    freeMinor
  );
}
