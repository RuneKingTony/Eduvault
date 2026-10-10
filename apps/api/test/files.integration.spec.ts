import { randomUUID } from 'node:crypto';
import type { FileRef, SchoolProfile } from '@eduvault/api-contract';
import { FileSweepService } from '../src/app/common/files';
import {
  baseTest,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import { twoSchools, type TwoSchools } from './support/two-schools';

const test = baseTest.extend<{
  schools: TwoSchools;
  upload: (user: TestUser, bytes: Buffer, name?: string) => Promise<FileRef>;
  attach: (user: TestUser, file: FileRef) => Promise<SchoolProfile>;
}>({
  schools: async (
    { app, createUser, createOrganization, createCampus, addMember },
    use
  ) => {
    await use(
      await twoSchools({
        app,
        createUser,
        createOrganization,
        createCampus,
        addMember,
      })
    );
  },
  upload: async ({ api }, use) => {
    await use(async (user, bytes, name = 'logo.png') => {
      const res = await api(user)
        .post('/files')
        .field('kind', 'school_logo')
        .attach('file', bytes, { filename: name })
        .expect(201);
      return res.body as FileRef;
    });
  },
  attach: async ({ api }, use) => {
    await use(async (user, file) => {
      const res = await api(user)
        .put('/school-account/logo')
        .send({ fileId: file.id })
        .expect(200);
      return res.body as SchoolProfile;
    });
  },
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size = 64) =>
  Buffer.concat([Buffer.from(PNG_SIGNATURE), Buffer.alloc(size, 7)]);

const WRONG_TYPE = 'Choose a PNG, JPG or WebP logo.';
const TOO_BIG = 'That logo is over 1 MB. Please choose a smaller one.';
const UNUSABLE = 'That logo can’t be used. Please upload it again.';

type Api = Fixtures['api'];

const rowsFor = async (pool: Fixtures['pool'], id: string) => ({
  objects: (await pool.query(`SELECT 1 FROM file_object WHERE id = $1`, [id]))
    .rows.length,
  blobs: (await pool.query(`SELECT 1 FROM file_blob WHERE file_id = $1`, [id]))
    .rows.length,
});

const post = (api: Api, user: TestUser) => api(user).post('/files');

test.describe('uploading', () => {
  test('stores a PNG and returns its reference with the sniffed type', async ({
    pool,
    upload,
    schools: { owner },
  }) => {
    const file = await upload(owner, png(), 'my logo.jpg');

    expect(file).toMatchObject({
      contentType: 'image/png',
      byteSize: png().byteLength,
      originalName: 'my logo.jpg',
    });
    expect(await rowsFor(pool, file.id)).toEqual({ objects: 1, blobs: 1 });
    const { rows } = await pool.query(
      `SELECT sha256, uploaded_by FROM file_object WHERE id = $1`,
      [file.id]
    );
    expect(rows[0].sha256).toHaveLength(64);
    expect(rows[0].uploaded_by).toBe(owner.id);
  });

  test('refuses a GIF and an executable that carries a .png name', async ({
    api,
    schools: { owner },
  }) => {
    for (const bytes of [
      Buffer.from('GIF89a\u0001\u0000\u0001\u0000'),
      Buffer.from('MZ\u0090\u0000\u0003\u0000'),
    ]) {
      const res = await post(api, owner)
        .field('kind', 'school_logo')
        .attach('file', bytes, {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(400);
      expect(res.body.message).toBe(WRONG_TYPE);
    }
  });

  test('refuses a file over 1 MB but takes exactly 1 MB', async ({
    api,
    upload,
    schools: { owner },
  }) => {
    const res = await post(api, owner)
      .field('kind', 'school_logo')
      .attach('file', png(1_572_864), { filename: 'big.png' })
      .expect(400);
    expect(res.body.message).toBe(TOO_BIG);

    const huge = await post(api, owner)
      .field('kind', 'school_logo')
      .attach('file', png(9_437_184), { filename: 'huge.png' })
      .expect(400);
    expect(huge.body.message).toBe(TOO_BIG);

    const fileFirst = await api(owner)
      .post('/files')
      .attach('file', png(1_572_864), { filename: 'big.png' })
      .field('kind', 'school_logo')
      .expect(400);
    expect(fileFirst.body.message).toBe(TOO_BIG);

    const exact = png(1_048_576 - PNG_SIGNATURE.length);
    expect((await upload(owner, exact)).byteSize).toBe(1_048_576);
  });

  test('refuses a missing file, an unknown kind and a caller without schoolAccount:update', async ({
    api,
    schools: { owner, noPermission },
  }) => {
    await post(api, owner).field('kind', 'school_logo').expect(400);
    await post(api, owner)
      .field('kind', 'payment_proof')
      .attach('file', png(), { filename: 'a.png' })
      .expect(400);
    const denied = await post(api, noPermission)
      .field('kind', 'school_logo')
      .attach('file', png(), { filename: 'a.png' })
      .expect(403);
    expect(denied.body.message).toBe(
      'You need permission to change school settings.'
    );
    await api().post('/files').expect(401);
  });
});

test.describe('the logo', () => {
  test('attaches, is served to every member with safe headers and shows on the profile', async ({
    api,
    upload,
    attach,
    schools: { owner, noPermission, lekkiOnly },
  }) => {
    const file = await upload(owner, png());

    const profile = await attach(owner, file);

    expect(profile).toMatchObject({
      logoFileId: file.id,
      logoUrl: `/files/${file.id}`,
    });
    for (const user of [owner, noPermission, lekkiOnly]) {
      const res = await api(user)
        .get(`/files/${file.id}`)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            done(null, Buffer.concat(chunks));
          });
        })
        .expect(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private');
      expect(Buffer.compare(res.body as Buffer, png())).toBe(0);
    }
  });

  test('replacing it deletes the old file and removing it deletes the current one', async ({
    api,
    pool,
    upload,
    attach,
    schools: { owner },
  }) => {
    const first = await upload(owner, png(10));
    const second = await upload(owner, png(20));
    await attach(owner, first);

    await attach(owner, second);

    expect(await rowsFor(pool, first.id)).toEqual({ objects: 0, blobs: 0 });
    expect(await rowsFor(pool, second.id)).toEqual({ objects: 1, blobs: 1 });

    const removed = await api(owner).delete('/school-account/logo').expect(200);
    expect(removed.body).toMatchObject({ logoFileId: null, logoUrl: null });
    expect(await rowsFor(pool, second.id)).toEqual({ objects: 0, blobs: 0 });
  });

  test('refuses a file of another school, an unknown id and one already attached', async ({
    api,
    upload,
    attach,
    schools: { owner, ownerB },
  }) => {
    const foreign = await upload(ownerB, png());
    const own = await upload(owner, png());
    await attach(owner, own);

    for (const fileId of [foreign.id, randomUUID(), own.id]) {
      const res = await api(owner)
        .put('/school-account/logo')
        .send({ fileId })
        .expect(400);
      expect(res.body.message).toBe(UNUSABLE);
    }
  });

  test('lets one of two simultaneous attaches of the same file win', async ({
    api,
    upload,
    schools: { owner },
  }) => {
    const file = await upload(owner, png());

    const statuses = (
      await Promise.all(
        [1, 2].map(() =>
          api(owner).put('/school-account/logo').send({ fileId: file.id })
        )
      )
    ).map((res) => res.status);

    expect(statuses.toSorted((a, b) => a - b)).toEqual([200, 400]);
  });
});

test.describe('reading a file', () => {
  test('answers 404 for another school’s, an unattached and a nonexistent file', async ({
    api,
    upload,
    attach,
    schools: { owner, ownerB },
  }) => {
    const attached = await upload(owner, png());
    const loose = await upload(owner, png());
    await attach(owner, attached);

    await api(ownerB).get(`/files/${attached.id}`).expect(404);
    await api(owner).get(`/files/${loose.id}`).expect(404);
    await api(owner).get(`/files/${randomUUID()}`).expect(404);
    await api().get(`/files/${attached.id}`).expect(401);
  });
});

test.describe('deleting a file', () => {
  test('a writer removes an unattached file and clears an attached logo', async ({
    api,
    pool,
    upload,
    attach,
    schools: { owner, ownerB, noPermission },
  }) => {
    const loose = await upload(owner, png());
    const logo = await upload(owner, png());
    await attach(owner, logo);

    await api(ownerB).delete(`/files/${logo.id}`).expect(404);
    await api(noPermission).delete(`/files/${logo.id}`).expect(403);
    await api(noPermission).delete(`/files/${loose.id}`).expect(404);
    await api(owner).delete(`/files/${loose.id}`).expect(204);
    await api(owner).delete(`/files/${logo.id}`).expect(204);

    expect(await rowsFor(pool, loose.id)).toEqual({ objects: 0, blobs: 0 });
    expect(
      (await api(owner).get('/school-account').expect(200)).body
    ).toMatchObject({ logoFileId: null });
  });
});

test.describe('the orphan sweep', () => {
  test('deletes an unattached file after a day and keeps an attached one', async ({
    app,
    pool,
    upload,
    attach,
    schools: { owner },
  }) => {
    const loose = await upload(owner, png());
    const logo = await upload(owner, png());
    await attach(owner, logo);
    const sweep = app.get(FileSweepService);

    expect(await sweep.sweep(new Date())).toBe(0);
    expect(await sweep.sweep(new Date(Date.now() + 25 * 3_600_000))).toBe(1);

    expect(await rowsFor(pool, loose.id)).toEqual({ objects: 0, blobs: 0 });
    expect(await rowsFor(pool, logo.id)).toEqual({ objects: 1, blobs: 1 });
  });
});
