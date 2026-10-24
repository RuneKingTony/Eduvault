import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export type ProofState = 'missing' | 'taken' | 'free';

export async function fileProofState(
  db: Kysely<DB>,
  proof: { organizationId: string; userId: string; fileId: string },
  attachment: {
    kind: 'payment_proof' | 'wallet_proof';
    table: 'payment' | 'wallet_topup';
  }
): Promise<ProofState> {
  const { organizationId, userId, fileId } = proof;
  const file = await db
    .selectFrom('file_object')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('uploaded_by', '=', userId)
    .where('id', '=', fileId)
    .where('kind', '=', attachment.kind)
    .executeTakeFirst();
  if (file === undefined) {
    return 'missing';
  }
  const attached = await db
    .selectFrom(attachment.table)
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('proof_file_id', '=', fileId)
    .executeTakeFirst();
  return attached === undefined ? 'free' : 'taken';
}

export const paymentProofState = (
  db: Kysely<DB>,
  proof: { organizationId: string; userId: string; fileId: string }
): Promise<ProofState> =>
  fileProofState(db, proof, { kind: 'payment_proof', table: 'payment' });
