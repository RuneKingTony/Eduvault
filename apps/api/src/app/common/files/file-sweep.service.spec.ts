import type { Env } from '../config/env';
import { FileSweepService, ORPHAN_AGE_MS } from './file-sweep.service';
import { FilesRepository } from './files.repository';

class FakeFiles extends FilesRepository {
  cutoffs: Date[] = [];

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

  deleteOrphansUploadedBefore(cutoff: Date) {
    this.cutoffs.push(cutoff);
    return Promise.resolve(2);
  }
}

describe('FileSweepService', () => {
  it('sweeps files uploaded more than 24 hours before now', async () => {
    const files = new FakeFiles();
    const service = new FileSweepService(files, { NODE_ENV: 'test' } as Env);
    const now = new Date('2026-10-10T12:00:00.000Z');

    await expect(service.sweep(now)).resolves.toBe(2);

    expect(ORPHAN_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(files.cutoffs[0]?.toISOString()).toBe('2026-10-09T12:00:00.000Z');
  });

  it('starts no timer under NODE_ENV=test', () => {
    const service = new FileSweepService(new FakeFiles(), {
      NODE_ENV: 'test',
    } as Env);

    service.onApplicationBootstrap();
    service.onApplicationShutdown();

    expect(Reflect.get(service, 'timer')).toBeUndefined();
  });

  it('sweeps once at startup outside tests, so a process restarted daily still sweeps', () => {
    const files = new FakeFiles();
    const service = new FileSweepService(files, {
      NODE_ENV: 'production',
    } as Env);

    service.onApplicationBootstrap();
    service.onApplicationShutdown();

    expect(files.cutoffs).toHaveLength(1);
  });
});
