import { randomBytes, randomUUID } from 'node:crypto';
import type { FileStore } from '../src/app/common/files/file-store';

interface FileStoreHarness {
  store: FileStore;
  schoolA: string;
  schoolB: string;
  /** Creates what the driver needs before `put` accepts the key (the Postgres driver's `file_object` row). */
  prepare: (organizationId: string, key: string) => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Keys are file ids, which are globally unique, so the contract never puts
 * one key under two schools: the Postgres schema forbids it.
 */
export function describeFileStoreContract(
  name: string,
  makeStore: () => Promise<FileStoreHarness>
): void {
  describe(`${name} file store contract`, () => {
    let harness: FileStoreHarness;

    beforeAll(async () => {
      harness = await makeStore();
    });

    afterAll(async () => {
      await harness.stop();
    });

    async function stored(bytes = randomBytes(2048)) {
      const key = randomUUID();
      await harness.prepare(harness.schoolA, key);
      await harness.store.put({
        organizationId: harness.schoolA,
        key,
        bytes,
      });
      return { key, bytes };
    }

    it('returns the bytes that were put, unchanged', async () => {
      const everyByte = Buffer.from(Array.from({ length: 256 }, (_, n) => n));
      const { key, bytes } = await stored(everyByte);

      const read = await harness.store.get({
        organizationId: harness.schoolA,
        key,
      });

      expect(read?.equals(bytes)).toBe(true);
    });

    it('answers undefined for a key that was never put', async () => {
      await expect(
        harness.store.get({
          organizationId: harness.schoolA,
          key: randomUUID(),
        })
      ).resolves.toBeUndefined();
    });

    it('does not read another school’s bytes through the same key', async () => {
      const { key } = await stored();

      await expect(
        harness.store.get({ organizationId: harness.schoolB, key })
      ).resolves.toBeUndefined();
    });

    it('answers undefined after the bytes are deleted', async () => {
      const { key } = await stored();

      await harness.store.delete({ organizationId: harness.schoolA, key });

      await expect(
        harness.store.get({ organizationId: harness.schoolA, key })
      ).resolves.toBeUndefined();
    });

    it('resolves when deleting a key that was never put', async () => {
      await expect(
        harness.store.delete({
          organizationId: harness.schoolA,
          key: randomUUID(),
        })
      ).resolves.toBeUndefined();
    });

    it('leaves another school’s bytes when deleting the same key under a different school', async () => {
      const { key, bytes } = await stored();

      await harness.store.delete({ organizationId: harness.schoolB, key });

      const read = await harness.store.get({
        organizationId: harness.schoolA,
        key,
      });
      expect(read?.equals(bytes)).toBe(true);
    });
  });
}
