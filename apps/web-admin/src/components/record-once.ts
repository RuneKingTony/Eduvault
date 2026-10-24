import type { FileKind } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import type { Api } from '../api';

export interface UploadedProof {
  file: File;
  id: string;
}

interface ProofUpload {
  file: File | undefined;
  kind?: FileKind;
  /** Whether this payment method needs a proof; the contracts differ. */
  needed: boolean;
  uploaded: UploadedProof | undefined;
  remember: (stored: UploadedProof) => void;
}

/**
 * The stored file's id for a proof, uploading it at most once: a retry after
 * a refused request sends the same file again and must not store it twice.
 */
export async function uploadProofOnce(
  api: Api,
  { file, kind = 'payment_proof', needed, uploaded, remember }: ProofUpload
): Promise<string | undefined> {
  if (!needed || file === undefined) {
    return undefined;
  }
  if (uploaded?.file === file) {
    return uploaded.id;
  }
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', file);
  const stored = await api.files.upload({ body: form });
  remember({ file, id: stored.id });
  return stored.id;
}

/** Warns that a repeated request was already recorded; says whether it was. */
export function announceReplay<T extends { replayed: boolean }>(
  result: T,
  message: (replayed: T) => string
): boolean {
  if (!result.replayed) {
    return false;
  }
  toast.warning(message(result));
  return true;
}
