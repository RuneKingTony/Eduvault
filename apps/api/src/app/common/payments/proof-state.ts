import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export type ProofState = 'missing' | 'taken' | 'free';

export async function paymentProofState(
  db: Kysely<DB>,
  proof: { organizationId: string; userId: string; fileId: string }
): Promise<ProofState> {
  const { organizationId, userId, fileId } = proof;
  const file = await db
    .selectFrom('file_object')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('uploaded_by', '=', userId)
    .where('id', '=', fileId)
    .where('kind', '=', 'payment_proof')
    .executeTakeFirst();
  if (file === undefined) {
    return 'missing';
  }
  const attached = await db
    .selectFrom('payment')
    .select('id')
    .where('organization_id', '=', organizationId)
    .where('proof_file_id', '=', fileId)
    .executeTakeFirst();
  return attached === undefined ? 'free' : 'taken';
}
