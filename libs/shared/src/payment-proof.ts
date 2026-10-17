const EXTENSIONS_BY_TYPE = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic', 'heif'],
  'application/pdf': ['pdf'],
} as const;

export type ProofFileType = keyof typeof EXTENSIONS_BY_TYPE;

export const PROOF_FILE_TYPES = Object.keys(
  EXTENSIONS_BY_TYPE
) as readonly ProofFileType[];

const PROOF_EXTENSIONS: ReadonlySet<string> = new Set(
  Object.values(EXTENSIONS_BY_TYPE).flat()
);

const HEIF_MIME_TYPE = 'image/heif';

const extensionOf = (fileName: string): string =>
  fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();

function isProofType(type: string): boolean {
  const lower = type.toLowerCase();
  return (
    lower === HEIF_MIME_TYPE ||
    (PROOF_FILE_TYPES as readonly string[]).includes(lower)
  );
}

/** Some browsers leave the type empty for HEIC, so the extension decides then. */
export function isProofFile(file: { name: string; type: string }): boolean {
  return file.type === ''
    ? PROOF_EXTENSIONS.has(extensionOf(file.name))
    : isProofType(file.type);
}
