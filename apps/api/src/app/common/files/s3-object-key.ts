import type { StoredFileKey } from './file-store';

const unsafe = (part: string): boolean =>
  part === '' || part.includes('/') || part.includes('..');

/** `<organizationId>/<key>`; a part that could leave its prefix is refused. */
export function objectKey({ organizationId, key }: StoredFileKey): string {
  if (unsafe(organizationId) || unsafe(key)) {
    throw new Error(
      'Refusing a file key that is empty or contains "/" or ".."'
    );
  }
  return `${organizationId}/${key}`;
}
