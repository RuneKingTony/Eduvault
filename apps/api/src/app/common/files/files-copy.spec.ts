import { createHash } from 'node:crypto';
import type { FileStore, StoredFileKey } from './file-store';
import { copyFailed, copyFiles, parseCopyArgs } from './files-copy';
import { FilesRepository, type StoredFile } from './files.repository';

const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

const file = (id: string, bytes: Buffer): StoredFile => ({
  id,
  organizationId: 'school-a',
  kind: 'school_logo',
  storageKey: id,
  contentType: 'image/png',
  byteSize: bytes.byteLength,
  originalName: 'logo.png',
  sha256: hash(bytes),
});

class FakeFiles extends FilesRepository {
  constructor(private readonly rows: StoredFile[]) {
    super();
  }

  insert() {
    return Promise.resolve();
  }

  findById() {
    return Promise.resolve(undefined);
  }

  isAttached() {
    return Promise.resolve(false);
  }

  delete() {
    return Promise.resolve();
  }

  findOrphansUploadedBefore() {
    return Promise.resolve([]);
  }

  listAfter(afterId: string | undefined, limit: number) {
    return Promise.resolve(
      this.rows
        .filter((row) => afterId === undefined || row.id > afterId)
        .slice(0, limit)
    );
  }
}

class MemoryStore implements FileStore {
  blobs = new Map<string, Buffer>();
  puts = 0;

  put({ key, bytes }: StoredFileKey & { bytes: Buffer }) {
    this.puts += 1;
    this.blobs.set(key, bytes);
    return Promise.resolve();
  }

  get({ key }: StoredFileKey) {
    return Promise.resolve(this.blobs.get(key));
  }

  delete({ key }: StoredFileKey) {
    this.blobs.delete(key);
    return Promise.resolve();
  }
}

const A = Buffer.from('aaa');
const B = Buffer.from('bbb');

describe('parseCopyArgs', () => {
  it('reads both drivers and defaults to a dry run', () => {
    expect(parseCopyArgs(['--from=postgres', '--to=s3'])).toEqual({
      from: 'postgres',
      to: 's3',
      apply: false,
    });
    expect(parseCopyArgs(['--from=s3', '--to=postgres', '--apply'])).toEqual({
      from: 's3',
      to: 'postgres',
      apply: true,
    });
  });

  it.each([
    [[]],
    [['--from=postgres']],
    [['--from=postgres', '--to=postgres']],
    [['--from=disk', '--to=s3']],
    [['--from=postgres', '--to=s3', '--force']],
  ])('refuses %j', (argv) => {
    expect(() => parseCopyArgs(argv)).toThrow(/--from|--to|Usage/);
  });
});

describe('copyFiles', () => {
  const rows = [file('a', A), file('b', B)];

  function setup() {
    const from = new MemoryStore();
    const to = new MemoryStore();
    from.blobs.set('a', A);
    from.blobs.set('b', B);
    return { from, to, files: new FakeFiles(rows) };
  }

  it('writes nothing on a dry run and counts what it would copy', async () => {
    const { from, to, files } = setup();

    const counts = await copyFiles({ files, from, to, apply: false });

    expect(counts).toEqual({
      copied: 2,
      alreadyPresent: 0,
      sourceMissing: 0,
      mismatched: 0,
    });
    expect(to.puts).toBe(0);
  });

  it('copies on apply and copies nothing on the second run', async () => {
    const { from, to, files } = setup();

    await copyFiles({ files, from, to, apply: true });
    const second = await copyFiles({ files, from, to, apply: true });

    expect(to.blobs.get('a')).toEqual(A);
    expect(to.puts).toBe(2);
    expect(second).toMatchObject({ copied: 0, alreadyPresent: 2 });
  });

  it('reports a missing source and does not fail the rest', async () => {
    const { from, to, files } = setup();
    from.blobs.delete('a');

    const counts = await copyFiles({ files, from, to, apply: true });

    expect(counts).toMatchObject({ copied: 1, sourceMissing: 1 });
    expect(copyFailed(counts)).toBe(true);
  });

  it('reports a destination that holds other bytes and leaves it alone', async () => {
    const { from, to, files } = setup();
    to.blobs.set('a', Buffer.from('corrupt'));

    const counts = await copyFiles({ files, from, to, apply: true });

    expect(counts).toMatchObject({ copied: 1, mismatched: 1 });
    expect(to.blobs.get('a')).toEqual(Buffer.from('corrupt'));
  });

  it('does not copy a source that no longer matches its recorded hash', async () => {
    const { from, to, files } = setup();
    from.blobs.set('a', Buffer.from('rotten'));

    const counts = await copyFiles({ files, from, to, apply: true });

    expect(counts).toMatchObject({ copied: 1, mismatched: 1 });
    expect(to.blobs.has('a')).toBe(false);
  });

  it('reports a copy that reads back different', async () => {
    const { from, files } = setup();
    const lossy = new MemoryStore();
    lossy.put = ({ key }) => {
      lossy.blobs.set(key, Buffer.from('truncated'));
      return Promise.resolve();
    };

    const counts = await copyFiles({ files, from, to: lossy, apply: true });

    expect(counts.mismatched).toBe(2);
    expect(copyFailed(counts)).toBe(true);
  });

  it('walks past one page', async () => {
    const many = Array.from({ length: 450 }, (_, index) =>
      file(String(index).padStart(4, '0'), A)
    );
    const from = new MemoryStore();
    for (const row of many) {
      from.blobs.set(row.id, A);
    }

    const counts = await copyFiles({
      files: new FakeFiles(many),
      from,
      to: new MemoryStore(),
      apply: true,
    });

    expect(counts.copied).toBe(450);
  });
});
