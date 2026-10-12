import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '../src/db/db-types';
import { PostgresFileStore } from '../src/app/common/files/postgres-file-store';
import { describeFileStoreContract } from './file-store.contract';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
const schools = [randomUUID(), randomUUID()] as const;

const insertFileObject = (organizationId: string, key: string) =>
  pool.query(
    `INSERT INTO file_object (id, organization_id, kind, storage_key, content_type, byte_size, sha256, original_name)
     VALUES ($1::uuid, $2, 'school_logo', $1::text, 'image/png', 1, 'x', 'logo.png')`,
    [key, organizationId]
  );

beforeAll(async () => {
  for (const id of schools) {
    await pool.query(
      `INSERT INTO organization (id, name, slug, "createdAt") VALUES ($1::text, $1::text, $1::text, now())`,
      [id]
    );
  }
});

afterAll(async () => {
  await pool.query(`DELETE FROM organization WHERE id = ANY($1)`, [schools]);
  await db.destroy();
});

describeFileStoreContract('Postgres', () =>
  Promise.resolve({
    store: new PostgresFileStore(db),
    schoolA: schools[0],
    schoolB: schools[1],
    prepare: async (organizationId, key) => {
      await insertFileObject(organizationId, key);
    },
    stop: () => Promise.resolve(),
  })
);

describe('Postgres file store', () => {
  it('drops the bytes with the file_object row, which is what the old sweep relied on', async () => {
    const key = randomUUID();
    await insertFileObject(schools[0], key);
    const store = new PostgresFileStore(db);
    await store.put({
      organizationId: schools[0],
      key,
      bytes: Buffer.from('abc'),
    });

    await pool.query('DELETE FROM file_object WHERE id = $1', [key]);

    await expect(
      store.get({ organizationId: schools[0], key })
    ).resolves.toBeUndefined();
  });
});
