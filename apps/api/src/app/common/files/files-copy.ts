import { createHash } from 'node:crypto';
import type { FileStore } from './file-store';
import type { FilesRepository, StoredFile } from './files.repository';

export const COPY_DRIVERS = ['postgres', 's3'] as const;

export type CopyDriver = (typeof COPY_DRIVERS)[number];

interface CopyOptions {
  from: CopyDriver;
  to: CopyDriver;
  apply: boolean;
}

type CopyOutcome = 'copied' | 'alreadyPresent' | 'sourceMissing' | 'mismatched';

type CopyCounts = Record<CopyOutcome, number>;

const PAGE_SIZE = 200;
const USAGE =
  'Usage: files-copy --from=<postgres|s3> --to=<postgres|s3> [--apply]';

const sha256 = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex');

function driverFlag(argv: string[], name: 'from' | 'to'): CopyDriver {
  const prefix = `--${name}=`;
  const value = argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
  const driver = COPY_DRIVERS.find((candidate) => candidate === value);
  if (driver === undefined) {
    throw new Error(
      `--${name} must be one of ${COPY_DRIVERS.join(', ')}\n${USAGE}`
    );
  }
  return driver;
}

export function parseCopyArgs(argv: string[]): CopyOptions {
  const known = argv.every(
    (arg) =>
      arg === '--apply' || arg.startsWith('--from=') || arg.startsWith('--to=')
  );
  if (!known) {
    throw new Error(USAGE);
  }
  const from = driverFlag(argv, 'from');
  const to = driverFlag(argv, 'to');
  if (from === to) {
    throw new Error(`--from and --to are both ${from}\n${USAGE}`);
  }
  return { from, to, apply: argv.includes('--apply') };
}

interface CopyStores {
  from: FileStore;
  to: FileStore;
  apply: boolean;
}

/**
 * Never deletes or overwrites: a destination that holds different bytes is
 * reported, not replaced, and a source whose bytes do not match the recorded
 * hash is not propagated.
 */
async function copyOne(
  file: StoredFile,
  { from, to, apply }: CopyStores
): Promise<CopyOutcome> {
  const key = { organizationId: file.organizationId, key: file.storageKey };
  const existing = await to.get(key);
  if (existing !== undefined) {
    return sha256(existing) === file.sha256 ? 'alreadyPresent' : 'mismatched';
  }
  const bytes = await from.get(key);
  if (bytes === undefined) {
    return 'sourceMissing';
  }
  if (sha256(bytes) !== file.sha256) {
    return 'mismatched';
  }
  if (!apply) {
    return 'copied';
  }
  await to.put({ ...key, bytes });
  const written = await to.get(key);
  return written !== undefined && sha256(written) === file.sha256
    ? 'copied'
    : 'mismatched';
}

/** Dry run (`apply: false`) counts what `copied` would be and writes nothing. */
export async function copyFiles(
  input: CopyStores & {
    files: FilesRepository;
    onFile?: (file: StoredFile, outcome: CopyOutcome) => void;
  }
): Promise<CopyCounts> {
  const counts: CopyCounts = {
    copied: 0,
    alreadyPresent: 0,
    sourceMissing: 0,
    mismatched: 0,
  };
  let afterId: string | undefined;
  for (;;) {
    const page = await input.files.listAfter(afterId, PAGE_SIZE);
    for (const file of page) {
      const outcome = await copyOne(file, input);
      counts[outcome] += 1;
      input.onFile?.(file, outcome);
    }
    afterId = page.at(-1)?.id;
    if (afterId === undefined || page.length < PAGE_SIZE) {
      return counts;
    }
  }
}

export const copyFailed = (counts: CopyCounts): boolean =>
  counts.sourceMissing > 0 || counts.mismatched > 0;
