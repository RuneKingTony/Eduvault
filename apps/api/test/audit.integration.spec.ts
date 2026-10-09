import { randomUUID } from 'node:crypto';
import {
  acting,
  baseTest,
  expect,
  waitForAuditRows,
  type TestUser,
} from './support/base-test';

interface AuditKit {
  admin: TestUser;
  school: () => Promise<{ id: string; ownerUser: TestUser }>;
}

const test = baseTest.extend<{ kit: AuditKit }>({
  kit: async ({ createUser, makeSuperAdmin, createSchoolViaPlatform }, use) => {
    const admin = await makeSuperAdmin(await createUser());
    await use({
      admin,
      school: async () => {
        const ownerUser = await createUser();
        const { school } = await createSchoolViaPlatform(admin, {
          name: `School ${randomUUID().slice(0, 6)}`,
          ownerEmail: ownerUser.email,
        });
        return { id: school.id, ownerUser };
      },
    });
  },
});

const REASON = 'SUP-1';

test.describe('audit log', () => {
  test('lists newest first, ten a page, with a cursor to the rest', async ({
    api,
    pool,
    kit,
  }) => {
    const { id } = await kit.school();
    for (let index = 0; index < 12; index += 1) {
      await api(kit.admin).get('/students').set(acting(id)).expect(200);
    }
    await waitForAuditRows(pool, { kind: 'acting' }, 12);

    const first = await api(kit.admin).get('/platform/audit').expect(200);
    expect(first.body.items).toHaveLength(10);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await api(kit.admin)
      .get('/platform/audit')
      .query({ cursor: first.body.nextCursor })
      .expect(200);
    expect(second.body.items).toHaveLength(3);
    expect(second.body.nextCursor).toBeNull();

    const all = [...first.body.items, ...second.body.items] as {
      id: string;
      kind: string;
      createdAt: string;
    }[];
    expect(new Set(all.map((row) => row.id)).size).toBe(13);
    expect(all.map((row) => row.createdAt)).toEqual(
      all.map((row) => row.createdAt).toSorted((a, b) => b.localeCompare(a))
    );
    expect(all.at(-1)?.kind).toBe('platform');
    expect(first.body.items[0]).toMatchObject({
      kind: 'acting',
      actor: { id: kit.admin.id },
      school: { id },
      method: 'GET',
      action: null,
      path: '/students',
      status: 200,
      reason: null,
    });
    await api(kit.admin)
      .get('/platform/audit')
      .query({ cursor: '%%%' })
      .expect(400);
    for (const key of [
      { createdAt: 'x', id: 'y' },
      { createdAt: new Date().toISOString(), id: 'y' },
      { createdAt: 'x', id: randomUUID() },
    ]) {
      const res = await api(kit.admin)
        .get('/platform/audit')
        .query({
          cursor: Buffer.from(JSON.stringify(key)).toString('base64url'),
        })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'ValidationError' });
    }
  });

  test('stores the path without its query string', async ({
    api,
    pool,
    kit,
  }) => {
    const { id } = await kit.school();
    await api(kit.admin)
      .get('/students')
      .query({ campusId: randomUUID() })
      .set(acting(id))
      .expect(404);
    const [row] = await waitForAuditRows(pool, { kind: 'acting' }, 1);
    expect(row?.path).toBe('/students');
  });

  test('filters by school, by writes only and by kind with a smaller page', async ({
    api,
    pool,
    kit,
  }) => {
    const first = await kit.school();
    const second = await kit.school();
    for (let index = 0; index < 9; index += 1) {
      await api(kit.admin).get('/students').set(acting(first.id)).expect(200);
    }
    await api(kit.admin)
      .patch('/school-account')
      .set(acting(first.id, REASON))
      .send({ city: 'Abuja' })
      .expect(200);
    await api(kit.admin).get('/students').set(acting(second.id)).expect(200);
    await waitForAuditRows(pool, { kind: 'acting' }, 11);

    const forFirst = await api(kit.admin)
      .get('/platform/audit')
      .query({ schoolId: first.id, limit: 50 })
      .expect(200);
    expect(forFirst.body.items).toHaveLength(11);
    expect(
      forFirst.body.items.every(
        (row: { school: { id: string } }) => row.school.id === first.id
      )
    ).toBe(true);

    const writes = await api(kit.admin)
      .get('/platform/audit')
      .query({ writesOnly: true, limit: 50 })
      .expect(200);
    expect(
      writes.body.items.map((row: { kind: string; method: string | null }) => [
        row.kind,
        row.method,
      ])
    ).toEqual([
      ['acting', 'PATCH'],
      ['platform', null],
      ['platform', null],
    ]);
    expect(writes.body.items[0].reason).toBe(REASON);

    const reads = await api(kit.admin)
      .get('/platform/audit')
      .query({ kind: 'acting', limit: 8 })
      .expect(200);
    expect(reads.body.items).toHaveLength(8);
    expect(reads.body.nextCursor).toEqual(expect.any(String));
    expect(
      reads.body.items.every((row: { kind: string }) => row.kind === 'acting')
    ).toBe(true);
  });

  test('an unknown school answers 404 and a bad limit 400', async ({
    api,
    kit,
  }) => {
    await api(kit.admin)
      .get('/platform/audit')
      .query({ schoolId: 'nowhere' })
      .expect(404);
    await api(kit.admin)
      .get('/platform/audit')
      .query({ limit: 51 })
      .expect(400);
    await api(kit.admin).get('/platform/audit').query({ limit: 0 }).expect(400);
  });

  test('a school member gets 403 on the audit route', async ({ api, kit }) => {
    const { ownerUser } = await kit.school();
    await api(ownerUser).get('/platform/audit').expect(403);
  });

  test('an owner’s school routes never return an audit row', async ({
    api,
    pool,
    kit,
  }) => {
    const { id, ownerUser } = await kit.school();
    await api(kit.admin).get('/students').set(acting(id)).expect(200);
    await api(kit.admin)
      .patch('/school-account')
      .set(acting(id, REASON))
      .send({ city: 'Ibadan' })
      .expect(200);
    const rows = await waitForAuditRows(pool, { kind: 'acting' }, 2);
    expect(rows).toHaveLength(2);
    const auditIds = (
      await pool.query<{ id: string }>('SELECT id FROM audit_log')
    ).rows.map((row) => row.id);
    expect(auditIds.length).toBeGreaterThanOrEqual(3);

    for (const path of [
      '/students',
      '/campuses',
      '/school-account',
      '/me',
      '/me/permissions',
    ]) {
      const res = await api(ownerUser).get(path).expect(200);
      const text = JSON.stringify(res.body);
      for (const auditId of auditIds) {
        expect(text, path).not.toContain(auditId);
      }
    }
  });

  test('the table refuses UPDATE and DELETE', async ({ api, pool, kit }) => {
    const { id } = await kit.school();
    await api(kit.admin).get('/students').set(acting(id)).expect(200);
    await waitForAuditRows(pool, { kind: 'acting' }, 1);

    await expect(
      pool.query(`UPDATE audit_log SET status = 200`)
    ).rejects.toThrow('audit_log is append-only');
    await expect(pool.query(`DELETE FROM audit_log`)).rejects.toThrow(
      'audit_log is append-only'
    );
    const { rows } = await pool.query<{ total: string }>(
      `SELECT count(*) AS total FROM audit_log`
    );
    expect(Number(rows[0]?.total)).toBe(2);
  });

  test.describe('isolation', () => {
    test('case 6: no session answers 401', async ({ api }) => {
      await api().get('/platform/audit').expect(401);
    });

    test('case 5: an owner answers 403, even naming their own school', async ({
      api,
      kit,
    }) => {
      const { id, ownerUser } = await kit.school();
      await api(ownerUser)
        .get('/platform/audit')
        .query({ schoolId: id })
        .expect(403);
    });

    test('case 12: a write without a reason is refused and the refusal is audited', async ({
      api,
      pool,
      kit,
    }) => {
      const { id } = await kit.school();
      await api(kit.admin)
        .patch('/school-account')
        .set(acting(id))
        .send({ city: 'Abuja' })
        .expect(403);
      const rows = await waitForAuditRows(pool, { kind: 'acting' }, 1);
      expect(rows[0]).toMatchObject({ method: 'PATCH', status: 403 });
    });

    test('the audit rows are unreachable from school routes', async ({
      api,
      kit,
    }) => {
      const { ownerUser } = await kit.school();
      await api(ownerUser).get('/audit').expect(404);
      await api(ownerUser).get('/platform/audit').expect(403);
    });
  });
});
