import { randomUUID } from 'node:crypto';
import {
  ANNOUNCEMENT_EVERYONE_MESSAGE,
  ANNOUNCEMENT_NOT_FOUND_MESSAGE,
  type Announcement,
  type AnnouncementList,
  type AnnouncementSummary,
} from '@eduvault/api-contract';
import type { Permission } from '@eduvault/policy';
import { CAMPUS_NOT_FOUND_MESSAGE } from '../src/app/modules/campus/campus.service';
import { expect, type Fixtures, type TestUser } from './support/base-test';
import { createAnnouncement } from './support/factories/announcements';
import {
  bareSchoolsTest,
  type TwoSchoolsWithoutStudents as TwoSchools,
} from './support/two-schools';

const test = bareSchoolsTest;

type Api = Fixtures['api'];

const WRITER: Permission[] = [
  'announcement:create',
  'announcement:read',
  'announcement:update',
];

const draftBody = (campusId: string | null, overrides = {}) => ({
  title: 'PTA meeting',
  body: 'Saturday at ten.',
  tag: 'event',
  campusId,
  status: 'draft',
  ...overrides,
});

const listOf = async (
  api: Api,
  user: TestUser,
  query = ''
): Promise<AnnouncementList> =>
  (await api(user).get(`/announcements${query}`).expect(200))
    .body as AnnouncementList;

const feedOf = async (
  api: Api,
  user: TestUser
): Promise<AnnouncementSummary[]> =>
  (await api(user).get('/announcements/feed').expect(200))
    .body as AnnouncementSummary[];

const byId = (a: string, b: string) => a.localeCompare(b);

const refusedWithEveryoneMessage = (res: { body: { message: string } }) =>
  expect(res.body.message).toBe(ANNOUNCEMENT_EVERYONE_MESSAGE);

const insertRow = (
  pool: Fixtures['pool'],
  options: {
    schools: TwoSchools;
    overrides?: Record<string, unknown>;
    campusId?: string | null;
  }
) => {
  const { schools, overrides = {}, campusId = null } = options;
  const row = {
    organization_id: schools.orgA.id,
    campus_id: campusId,
    title: 'Raw',
    body: 'Raw body',
    tag: 'general',
    status: 'draft',
    pinned: false,
    published_on: null,
    created_by: schools.owner.id,
    ...overrides,
  };
  const columns = Object.keys(row);
  const placeholders = columns.map((_column, index) => `$${index + 1}`);
  return pool.query(
    `INSERT INTO announcement (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    Object.values(row)
  );
};

test.describe('isolation', () => {
  test('1: another school answers 404 on every id route and stays out of the lists', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, ownerB, campusB, lekki } = schools;
    const mine = await createAnnouncement(app, owner, { campusId: lekki.id });
    const theirs = await createAnnouncement(app, ownerB, {
      campusId: campusB.id,
    });

    await api(ownerB).get(`/announcements/${mine.id}`).expect(404);
    await api(ownerB)
      .patch(`/announcements/${mine.id}`)
      .send({ title: 'Hijack' })
      .expect(404);
    await api(ownerB).post(`/announcements/${mine.id}/publish`).expect(404);
    await api(ownerB).post(`/announcements/${mine.id}/withdraw`).expect(404);
    const pinned = await api(ownerB)
      .put(`/announcements/${mine.id}/pin`)
      .send({ pinned: true })
      .expect(404);
    expect(pinned.body.message).toBe(ANNOUNCEMENT_NOT_FOUND_MESSAGE);
    await api(owner).get(`/announcements/${theirs.id}`).expect(404);

    expect((await listOf(api, owner)).items.map((item) => item.id)).toEqual([
      mine.id,
    ]);
    expect((await feedOf(api, owner)).map((item) => item.id)).toEqual([
      mine.id,
    ]);
    expect((await listOf(api, ownerB)).items.map((item) => item.id)).toEqual([
      theirs.id,
    ]);
    expect((await feedOf(api, ownerB)).map((item) => item.id)).toEqual([
      theirs.id,
    ]);
  });

  test('2: a campusId naming another school’s campus answers 404 Campus not found', async ({
    api,
    schools,
  }) => {
    const { owner, campusB } = schools;
    const created = await api(owner)
      .post('/announcements')
      .send(draftBody(campusB.id))
      .expect(404);
    expect(created.body.message).toBe(CAMPUS_NOT_FOUND_MESSAGE);
  });

  test('3: a campus-scoped writer gets 404 for the Ikeja item on every route', async ({
    api,
    app,
    schools,
    withPermissions,
  }) => {
    const { orgA, owner, ikeja } = schools;
    const writer = await withPermissions(orgA, WRITER, {
      campuses: [schools.lekki],
    });
    const item = await createAnnouncement(app, owner, { campusId: ikeja.id });
    const draft = await createAnnouncement(app, owner, {
      campusId: ikeja.id,
      status: 'draft',
    });

    await api(writer).get(`/announcements/${item.id}`).expect(404);
    await api(writer)
      .patch(`/announcements/${item.id}`)
      .send({ title: 'Nope' })
      .expect(404);
    await api(writer).post(`/announcements/${draft.id}/publish`).expect(404);
    await api(writer).post(`/announcements/${item.id}/withdraw`).expect(404);
    await api(writer)
      .put(`/announcements/${item.id}/pin`)
      .send({ pinned: true })
      .expect(404);
    await api(writer)
      .post('/announcements')
      .send(draftBody(ikeja.id))
      .expect(404);
  });

  test('4: a campus-scoped writer lists only Lekki and Everyone items', async ({
    api,
    app,
    schools,
    withPermissions,
  }) => {
    const { orgA, owner, lekki, ikeja } = schools;
    const writer = await withPermissions(orgA, WRITER, { campuses: [lekki] });
    const lekkiItem = await createAnnouncement(app, owner, {
      campusId: lekki.id,
    });
    const everyoneItem = await createAnnouncement(app, owner, {
      campusId: null,
    });
    await createAnnouncement(app, owner, { campusId: ikeja.id });

    const list = await listOf(api, writer);
    expect(list.items.map((item) => item.id).toSorted(byId)).toEqual(
      [lekkiItem.id, everyoneItem.id].toSorted(byId)
    );
    expect(list.counts.published).toBe(2);
    expect(
      (await feedOf(api, writer)).map((item) => item.id).toSorted(byId)
    ).toEqual([lekkiItem.id, everyoneItem.id].toSorted(byId));
  });

  test('5: a member with no announcement permission gets 403 on every permission route', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, noPermission, lekki } = schools;
    const item = await createAnnouncement(app, owner, { campusId: lekki.id });

    await api(noPermission).get('/announcements').expect(403);
    await api(noPermission).get(`/announcements/${item.id}`).expect(403);
    await api(noPermission)
      .post('/announcements')
      .send(draftBody(lekki.id))
      .expect(403);
    await api(noPermission)
      .patch(`/announcements/${item.id}`)
      .send({ title: 'x' })
      .expect(403);
    await api(noPermission)
      .post(`/announcements/${item.id}/publish`)
      .expect(403);
    await api(noPermission)
      .post(`/announcements/${item.id}/withdraw`)
      .expect(403);
    await api(noPermission)
      .put(`/announcements/${item.id}/pin`)
      .send({ pinned: true })
      .expect(403);
  });

  test('6: no session answers 401 on every route', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const item = await createAnnouncement(app, owner, { campusId: lekki.id });

    await api().get('/announcements').expect(401);
    await api().get('/announcements/feed').expect(401);
    await api().get(`/announcements/${item.id}`).expect(401);
    await api().post('/announcements').send(draftBody(null)).expect(401);
    await api().patch(`/announcements/${item.id}`).send({}).expect(401);
    await api().post(`/announcements/${item.id}/publish`).expect(401);
    await api().post(`/announcements/${item.id}/withdraw`).expect(401);
    await api()
      .put(`/announcements/${item.id}/pin`)
      .send({ pinned: true })
      .expect(401);
  });

  test('7: a create naming another school’s campus answers 404 and the composite foreign key refuses a raw insert', async ({
    api,
    pool,
    schools,
  }) => {
    const { owner, campusB } = schools;
    await api(owner)
      .post('/announcements')
      .send(draftBody(campusB.id))
      .expect(404);
    await expect(
      insertRow(pool, { schools, campusId: campusB.id })
    ).rejects.toMatchObject({ code: '23503' });
  });
});

test.describe('database checks', () => {
  test('refuse a long title, a long body, a bad tag, a bad status and a pinned draft', async ({
    pool,
    schools,
  }) => {
    const refused = async (overrides: Record<string, unknown>) => {
      await expect(
        insertRow(pool, { schools, overrides })
      ).rejects.toMatchObject({
        code: '23514',
      });
    };
    await refused({ title: 'a'.repeat(81) });
    await refused({ body: 'a'.repeat(2001) });
    await refused({ tag: 'news' });
    await refused({ status: 'archived' });
    await refused({ pinned: true });
    await refused({ status: 'published', published_on: null });
    await insertRow(pool, {
      schools,
      overrides: { title: 'a'.repeat(80), body: 'a'.repeat(2000) },
    });
  });
});

test.describe('lifecycle', () => {
  test('answers 409 for each refused transition', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const draft = await createAnnouncement(app, owner, {
      campusId: lekki.id,
      status: 'draft',
    });
    const live = await createAnnouncement(app, owner, { campusId: lekki.id });

    await api(owner).post(`/announcements/${live.id}/publish`).expect(409);
    await api(owner).post(`/announcements/${draft.id}/withdraw`).expect(409);
    await api(owner)
      .put(`/announcements/${draft.id}/pin`)
      .send({ pinned: true })
      .expect(409);
    await api(owner)
      .patch(`/announcements/${live.id}`)
      .send({ status: 'draft' })
      .expect(409);
  });

  test('sets the publish date on publish and keeps it on edit', async ({
    api,
    clock,
    schools,
  }) => {
    const { owner, lekki } = schools;
    clock.set('2026-10-11');
    const created = (
      await api(owner)
        .post('/announcements')
        .send(draftBody(lekki.id))
        .expect(201)
    ).body as Announcement;
    expect(created).toMatchObject({ status: 'draft', publishedOn: null });

    const published = (
      await api(owner).post(`/announcements/${created.id}/publish`).expect(201)
    ).body as Announcement;
    expect(published.publishedOn).toBe('2026-10-11');

    clock.set('2026-10-20');
    const edited = (
      await api(owner)
        .patch(`/announcements/${created.id}`)
        .send({ body: 'Moved to noon.' })
        .expect(200)
    ).body as Announcement;
    expect(edited.publishedOn).toBe('2026-10-11');
    expect(edited.body).toBe('Moved to noon.');
    expect(edited.updatedBy?.id).toBe(owner.id);

    await api(owner).post(`/announcements/${created.id}/withdraw`).expect(201);
    const again = (
      await api(owner).post(`/announcements/${created.id}/publish`).expect(201)
    ).body as Announcement;
    expect(again.publishedOn).toBe('2026-10-20');
  });

  test('pins, unpins and unpins on withdraw', async ({ api, app, schools }) => {
    const { owner, lekki } = schools;
    const item = await createAnnouncement(app, owner, { campusId: lekki.id });
    const pinned = await api(owner)
      .put(`/announcements/${item.id}/pin`)
      .send({ pinned: true })
      .expect(200);
    expect(pinned.body.pinned).toBe(true);
    const withdrawn = (
      await api(owner).post(`/announcements/${item.id}/withdraw`).expect(201)
    ).body as Announcement;
    expect(withdrawn).toMatchObject({ status: 'withdrawn', pinned: false });
    expect(withdrawn.withdrawnAt).not.toBeNull();
  });

  test('orders the list pinned first and counts every tab', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const older = await createAnnouncement(app, owner, {
      campusId: lekki.id,
      title: 'Older',
    });
    const pinned = await createAnnouncement(app, owner, {
      campusId: lekki.id,
      title: 'Pinned',
    });
    await createAnnouncement(app, owner, {
      campusId: lekki.id,
      status: 'draft',
    });
    await api(owner)
      .put(`/announcements/${pinned.id}/pin`)
      .send({ pinned: true })
      .expect(200);

    const published = await listOf(api, owner, '?status=published');
    expect(published.items[0]?.id).toBe(pinned.id);
    expect(published.items.map((item) => item.id)).toContain(older.id);
    expect(published.total).toBe(2);
    expect(published.counts).toEqual({ published: 2, draft: 1, withdrawn: 0 });
    const paged = await listOf(
      api,
      owner,
      '?status=published&pageSize=1&page=2'
    );
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(2);
  });

  test('pages ten to a page by default and orders the Drafts and Withdrawn tabs newest first', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki } = schools;
    const published: Announcement[] = [];
    for (let index = 0; index < 11; index += 1) {
      published.push(
        await createAnnouncement(app, owner, { campusId: lekki.id })
      );
    }
    const first = await listOf(api, owner);
    expect(first.items).toHaveLength(10);
    expect(first.total).toBe(11);
    expect((await listOf(api, owner, '?page=2')).items).toHaveLength(1);

    const olderDraft = await createAnnouncement(app, owner, {
      campusId: lekki.id,
      status: 'draft',
    });
    const newerDraft = await createAnnouncement(app, owner, {
      campusId: lekki.id,
      status: 'draft',
    });
    expect(
      (await listOf(api, owner, '?status=draft')).items.map((item) => item.id)
    ).toEqual([newerDraft.id, olderDraft.id]);

    const [firstOut, secondOut] = published;
    await api(owner)
      .post(`/announcements/${firstOut?.id}/withdraw`)
      .expect(201);
    await api(owner)
      .post(`/announcements/${secondOut?.id}/withdraw`)
      .expect(201);
    expect(
      (await listOf(api, owner, '?status=withdrawn')).items.map(
        (item) => item.id
      )
    ).toEqual([secondOut?.id, firstOut?.id]);
  });

  test('has no delete route', async ({ api, app, schools }) => {
    const { owner, lekki } = schools;
    const item = await createAnnouncement(app, owner, { campusId: lekki.id });
    await api(owner).delete(`/announcements/${item.id}`).expect(404);
  });

  test('refuses an over-long title and body with 400', async ({
    api,
    schools,
  }) => {
    const { owner } = schools;
    await api(owner)
      .post('/announcements')
      .send(draftBody(null, { title: 'a'.repeat(81) }))
      .expect(400);
    await api(owner)
      .post('/announcements')
      .send(draftBody(null, { body: 'a'.repeat(2001) }))
      .expect(400);
    await api(owner)
      .post('/announcements')
      .send(draftBody(null, { tag: 'news' }))
      .expect(400);
  });
});

test.describe('everyone items', () => {
  test('answers 403 with the R8 message to a campus-scoped writer creating, editing, withdrawing or pinning one', async ({
    api,
    app,
    schools,
    withPermissions,
  }) => {
    const { orgA, owner, lekki } = schools;
    const writer = await withPermissions(orgA, WRITER, { campuses: [lekki] });
    const everyone = await createAnnouncement(app, owner, { campusId: null });

    refusedWithEveryoneMessage(
      await api(writer).post('/announcements').send(draftBody(null)).expect(403)
    );
    refusedWithEveryoneMessage(
      await api(writer)
        .patch(`/announcements/${everyone.id}`)
        .send({ title: 'New' })
        .expect(403)
    );
    refusedWithEveryoneMessage(
      await api(writer)
        .post(`/announcements/${everyone.id}/withdraw`)
        .expect(403)
    );
    refusedWithEveryoneMessage(
      await api(writer)
        .put(`/announcements/${everyone.id}/pin`)
        .send({ pinned: true })
        .expect(403)
    );
    await api(writer).get(`/announcements/${everyone.id}`).expect(200);
    await api(writer)
      .post('/announcements')
      .send(draftBody(lekki.id))
      .expect(201);
  });
});

test.describe('feed', () => {
  test('returns published in-scope items to a member with no announcement permission', async ({
    api,
    app,
    schools,
    addMember,
    createUser,
  }) => {
    const { orgA, owner, lekki, ikeja } = schools;
    const teacher = await addMember(orgA, await createUser(), {
      roles: ['teacher'],
      campuses: [lekki],
    });
    const visible = await createAnnouncement(app, owner, {
      campusId: lekki.id,
    });
    await createAnnouncement(app, owner, { campusId: ikeja.id });
    await createAnnouncement(app, owner, {
      campusId: lekki.id,
      status: 'draft',
    });
    expect((await feedOf(api, teacher)).map((item) => item.id)).toEqual([
      visible.id,
    ]);
    await api(teacher).get('/announcements').expect(403);
  });

  test('refuses portal-only members with 403', async ({
    api,
    schools,
    addMember,
    createUser,
  }) => {
    const { orgA, lekki } = schools;
    for (const role of ['guardian', 'student']) {
      const portal = await addMember(orgA, await createUser(), {
        roles: [role],
        campuses: [lekki],
      });
      await api(portal).get('/announcements/feed').expect(403);
    }
  });

  test('caps the limit at 20', async ({ api, schools }) => {
    await api(schools.owner).get('/announcements/feed?limit=21').expect(400);
    await api(schools.owner).get('/announcements/feed?limit=20').expect(200);
  });
});

test.describe('activity', () => {
  test('writes an activity row for create, edit, publish, withdraw, pin and unpin', async ({
    api,
    pool,
    schools,
  }) => {
    const { owner, orgA, lekki } = schools;
    const created = (
      await api(owner)
        .post('/announcements')
        .send(draftBody(lekki.id))
        .expect(201)
    ).body as Announcement;
    const id = created.id;
    await api(owner)
      .patch(`/announcements/${id}`)
      .send({ title: 'Edited' })
      .expect(200);
    await api(owner).post(`/announcements/${id}/publish`).expect(201);
    await api(owner)
      .put(`/announcements/${id}/pin`)
      .send({ pinned: true })
      .expect(200);
    await api(owner)
      .put(`/announcements/${id}/pin`)
      .send({ pinned: false })
      .expect(200);
    await api(owner).post(`/announcements/${id}/withdraw`).expect(201);

    const { rows } = await pool.query<{
      kind: string;
      campus_id: string;
      pillar: string;
      text: string;
    }>(
      `SELECT kind, campus_id, pillar, text FROM activity_event
       WHERE organization_id = $1 AND subject_type = 'announcement' AND subject_id = $2
       ORDER BY occurred_at, id`,
      [orgA.id, id]
    );
    expect(rows.map((row) => row.kind)).toEqual([
      'announcement.created',
      'announcement.updated',
      'announcement.published',
      'announcement.pinned',
      'announcement.unpinned',
      'announcement.withdrawn',
    ]);
    expect(rows.every((row) => row.pillar === 'foundation')).toBe(true);
    expect(rows.every((row) => row.campus_id === lekki.id)).toBe(true);
    expect(rows[2]?.text).toBe('Announcement “Edited” published by Test User.');
  });
});

test('a random id answers 404', async ({ api, schools }) => {
  await api(schools.owner).get(`/announcements/${randomUUID()}`).expect(404);
});
