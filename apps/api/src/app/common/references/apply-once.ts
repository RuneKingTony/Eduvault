import type { ConflictException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import { advisoryLock } from '../db/advisory-lock';

interface AppliedRow {
  id: string;
  requestHash: string;
}

type ReferenceClaim<Row extends AppliedRow> =
  | { status: 'first' }
  | { status: 'replayed'; existing: Row }
  | { status: 'clash'; existing: Row };

/**
 * Takes the transaction lock for a client reference, then reads what the
 * reference already applied. 'replayed' is the same request sent again;
 * 'clash' is another request using the reference. The caller keeps the
 * canonical request hash, the lookup and the outcome it answers with.
 */
export async function claimReference<Row extends AppliedRow>(
  trx: Kysely<DB>,
  claim: {
    lockKey: string;
    requestHash: string;
    find: () => Promise<Row | undefined>;
  }
): Promise<ReferenceClaim<Row>> {
  await advisoryLock(trx, claim.lockKey);
  const existing = await claim.find();
  if (existing === undefined) {
    return { status: 'first' };
  }
  return existing.requestHash === claim.requestHash
    ? { status: 'replayed', existing }
    : { status: 'clash', existing };
}

/**
 * The service side of a replay, once the caller has found the row for the
 * reference: a row the caller cannot see answers `taken` and never leaks its
 * number, another request answers `used`, the same request is the replay.
 */
export function replayOf<Visible>(replay: {
  visible: Visible | undefined;
  sameRequest: () => boolean;
  taken: () => ConflictException;
  used: () => ConflictException;
}): Visible {
  if (replay.visible === undefined) {
    throw replay.taken();
  }
  if (!replay.sameRequest()) {
    throw replay.used();
  }
  return replay.visible;
}
