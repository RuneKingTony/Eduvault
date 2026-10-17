import type { Env } from '../config/env';
import type { FileStore, StoredFileKey } from './file-store';
import { FileSweepService, ORPHAN_AGE_MS } from './file-sweep.service';
import { FilesRepository, type FileRecord } from './files.repository';
import { FilesService } from './files.service';

const orphan = (id: string): FileRecord => ({
  id,
  organizationId: 'school-a',
  kind: 'school_logo',
  storageKey: id,
  contentType: 'image/png',
  byteSize: 10,
  originalName: 'logo.png',
});

class FakeFiles extends FilesRepository {
  cutoffs: Date[] = [];
  rows: FileRecord[] = [];
  attached = new Set<string>();

  insert() {
    return Promise.resolve();
  }

  findById(organizationId: string, id: string) {
    return Promise.resolve(
      this.rows.find(
        (row) => row.id === id && row.organizationId === organizationId
      )
    );
  }

  isAttached(file: FileRecord) {
    return Promise.resolve(this.attached.has(file.id));
  }

  isVisible() {
    return Promise.resolve(true);
  }

  delete(_organizationId: string, id: string) {
    this.rows = this.rows.filter((row) => row.id !== id);
    return Promise.resolve();
  }

  findOrphansUploadedBefore(cutoff: Date) {
    this.cutoffs.push(cutoff);
    return Promise.resolve([...this.rows]);
  }

  listAfter() {
    return Promise.resolve([]);
  }
}

class FakeStore implements FileStore {
  deleted: string[] = [];
  failFor = new Set<string>();

  put() {
    return Promise.resolve();
  }

  get() {
    return Promise.resolve(undefined);
  }

  delete({ key }: StoredFileKey) {
    if (this.failFor.has(key)) {
      return Promise.reject(new Error('bucket unreachable'));
    }
    this.deleted.push(key);
    return Promise.resolve();
  }
}

function setup(nodeEnv: Env['NODE_ENV'] = 'test') {
  const files = new FakeFiles();
  const store = new FakeStore();
  const service = new FileSweepService(files, new FilesService(files, store), {
    NODE_ENV: nodeEnv,
  } as Env);
  return { files, store, service };
}

describe('FileSweepService', () => {
  it('sweeps files uploaded more than 24 hours before now', async () => {
    const { files, service } = setup();
    files.rows = [orphan('a'), orphan('b')];
    const now = new Date('2026-10-10T12:00:00.000Z');

    await expect(service.sweep(now)).resolves.toBe(2);

    expect(ORPHAN_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(files.cutoffs[0]?.toISOString()).toBe('2026-10-09T12:00:00.000Z');
  });

  it('deletes each orphan object before its row', async () => {
    const { files, store, service } = setup();
    files.rows = [orphan('a'), orphan('b')];

    await service.sweep(new Date());

    expect(store.deleted).toEqual(['a', 'b']);
    expect(files.rows).toEqual([]);
  });

  it('keeps the row of an orphan whose object could not be deleted and sweeps the rest', async () => {
    const { files, store, service } = setup();
    files.rows = [orphan('a'), orphan('b')];
    store.failFor.add('a');

    await expect(service.sweep(new Date())).resolves.toBe(1);

    expect(store.deleted).toEqual(['b']);
    expect(files.rows.map((row) => row.id)).toEqual(['a']);
  });

  it('leaves a file that was attached after it was selected', async () => {
    const { files, store, service } = setup();
    files.rows = [orphan('a')];
    files.attached.add('a');

    await expect(service.sweep(new Date())).resolves.toBe(0);

    expect(store.deleted).toEqual([]);
    expect(files.rows).toHaveLength(1);
  });

  it('starts no timer under NODE_ENV=test', () => {
    const { service } = setup();

    service.onApplicationBootstrap();
    service.onApplicationShutdown();

    expect(Reflect.get(service, 'timer')).toBeUndefined();
  });

  it('sweeps once at startup outside tests, so a process restarted daily still sweeps', () => {
    const { files, service } = setup('production');

    service.onApplicationBootstrap();
    service.onApplicationShutdown();

    expect(files.cutoffs).toHaveLength(1);
  });
});
