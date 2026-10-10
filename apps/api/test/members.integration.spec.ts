import {
  MEMBER_PAGE_SIZE,
  type CreateMemberResult,
  type MemberDetail,
  type MemberList,
  type MemberSummary,
} from '@eduvault/api-contract';
import { STARTER_ROLES, toPermissionMap } from '@eduvault/policy';
import { syncAllStarterRoles } from '../src/app/common/auth/starter-roles';
import {
  acting,
  baseTest,
  expect,
  waitForAuditRows,
  type Fixtures,
} from './support/base-test';
import { twoSchools, type TwoSchools } from './support/two-schools';

type Actor = NonNullable<Parameters<Fixtures['api']>[0]>;
type Api = Fixtures['api'];

interface Hired {
  user: Awaited<ReturnType<Fixtures['createUser']>>;
  member: MemberDetail;
}

interface HireOptions {
  campusIds: string[];
  name?: string;
  title?: string;
}

const test = baseTest.extend<{
  schools: TwoSchools;
  hire: (actor: Actor, options: HireOptions) => Promise<Hired>;
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
  hire: async ({ api, createUser, signIn }, use) => {
    await use(async (actor, { campusIds, name = 'Hire', title }) => {
      const user = await createUser({ name });
      const res = await api(actor)
        .post('/members')
        .send({ name, email: user.email, title, campusIds })
        .expect(201);
      await signIn(user);
      return { user, member: (res.body as CreateMemberResult).member };
    });
  },
});

const ESCALATION = 'it allows things you can’t do yourself.';
const MANAGER = [
  'member:read',
  'member:update',
  'member:delete',
  'campus:readAll',
  'student:read',
] as const;

const putRoles = (
  api: Api,
  actor: Actor,
  { id, ...body }: { id: string; roles: string[]; campusIds?: string[] }
) => api(actor).put(`/members/${id}/roles`).send(body);

const listAll = async (api: Api, actor: Actor): Promise<MemberSummary[]> => {
  const res = await api(actor).get('/members').expect(200);
  return (res.body as MemberList).items;
};

const idOf = async (api: Api, actor: Actor, userId: string) => {
  const res = await api(actor).get('/members?q=').expect(200);
  const found = (res.body as MemberList).items.find(
    (item) => item.userId === userId
  );
  if (found === undefined) {
    throw new Error(`member of ${userId} not listed`);
  }
  return found.id;
};

const userIds = (list: MemberList) => list.items.map((item) => item.userId);

test.describe('members', () => {
  test.describe('list', () => {
    test('orders by name, pages ten at a time and reports the total', async ({
      api,
      hire,
      schools: { owner, lekki },
    }) => {
      for (let n = 0; n < 10; n++) {
        await hire(owner, {
          campusIds: [lekki.id],
          name: `Staff ${String(n).padStart(2, '0')}`,
        });
      }
      const first = (await api(owner).get('/members').expect(200))
        .body as MemberList;
      expect(first.total).toBe(13);
      expect(first.items).toHaveLength(MEMBER_PAGE_SIZE);
      const order = first.items.map((item) => item.name);
      expect(order).toEqual(order.toSorted((a, b) => a.localeCompare(b)));

      const second = (await api(owner).get('/members?page=2').expect(200))
        .body as MemberList;
      expect(second.items).toHaveLength(3);
      expect(second.total).toBe(13);
    });

    test('searches name, title and role', async ({
      api,
      hire,
      schools: { owner, lekki, lekkiOnly },
    }) => {
      const found = await hire(owner, {
        campusIds: [lekki.id],
        name: 'Chidi Okeke',
        title: 'Exams coordinator',
      });
      const search = async (q: string) =>
        userIds((await api(owner).get(`/members?q=${q}`).expect(200)).body);
      expect(await search('okeke')).toEqual([found.user.id]);
      expect(await search('COORDINATOR')).toEqual([found.user.id]);
      expect(await search('burs')).toEqual([lekkiOnly.id]);
      expect(await search('%25')).toEqual([]);
    });

    test('filters by role slug', async ({
      api,
      schools: { owner, lekkiOnly },
    }) => {
      const res = (await api(owner).get('/members?role=bursar').expect(200))
        .body as MemberList;
      expect(userIds(res)).toEqual([lekkiOnly.id]);
      expect(res.total).toBe(1);
    });

    test('hides portal-only members unless the filter names student or guardian', async ({
      api,
      hire,
      schools: { owner, lekki },
    }) => {
      const parent = await hire(owner, { campusIds: [lekki.id] });
      await putRoles(api, owner, {
        id: parent.member.id,
        roles: ['guardian'],
        campusIds: [lekki.id],
      }).expect(200);

      const all = (await api(owner).get('/members').expect(200))
        .body as MemberList;
      expect(userIds(all)).not.toContain(parent.user.id);
      const filtered = (
        await api(owner).get('/members?role=guardian').expect(200)
      ).body as MemberList;
      expect(userIds(filtered)).toEqual([parent.user.id]);
    });

    test('shows a scoped viewer only members sharing a campus, and only their campuses', async ({
      api,
      hire,
      withPermissions,
      schools: { orgA, owner, lekki, ikeja, noPermission },
    }) => {
      const viewer = await withPermissions(orgA, ['member:read'], {
        campuses: [lekki],
      });
      const both = await hire(owner, { campusIds: [lekki.id, ikeja.id] });
      const ikejaOnly = await hire(owner, { campusIds: [ikeja.id] });

      const list = (await api(viewer).get('/members').expect(200))
        .body as MemberList;
      expect(userIds(list)).toContain(both.user.id);
      expect(userIds(list)).not.toContain(ikejaOnly.user.id);
      expect(userIds(list)).not.toContain(noPermission.id);
      const seen = list.items.find((item) => item.userId === both.user.id);
      expect(seen?.campusIds).toEqual([lekki.id]);
      expect(seen?.roles).toEqual(['member']);
    });
  });

  test.describe('roles catalogue', () => {
    test('lists built-in, starter and custom roles with what the caller can give', async ({
      api,
      createRole,
      withPermissions,
      schools: { orgA, owner },
    }) => {
      await createRole(orgA, {
        slug: 'cashier',
        label: 'Cashier',
        permissions: ['schoolAccount:update'],
      });
      const manager = await withPermissions(orgA, MANAGER);
      const res = await api(manager).get('/members/roles').expect(200);
      const roles = res.body as { slug: string; grantable: boolean }[];
      expect(roles.slice(0, 2).map((role) => role.slug)).toEqual([
        'owner',
        'member',
      ]);
      const grantable = Object.fromEntries(
        roles.map((role) => [role.slug, role.grantable])
      );
      expect(grantable).toMatchObject({
        owner: false,
        member: true,
        teacher: true,
        cashier: false,
      });
      const asOwner = (await api(owner).get('/members/roles').expect(200))
        .body as { slug: string; grantable: boolean }[];
      expect(asOwner.find((role) => role.slug === 'cashier')?.grantable).toBe(
        true
      );
    });
  });

  test.describe('create', () => {
    test('adds a member holding only member, with a temporary password shown once', async ({
      api,
      pool,
      signIn,
      schools: { owner, lekki },
    }) => {
      const email = 'new.hire@example.test';
      const res = await api(owner)
        .post('/members')
        .send({ name: 'New Hire', email, campusIds: [lekki.id] })
        .expect(201);
      const body = res.body as CreateMemberResult;
      expect(body.temporaryPassword).toEqual(expect.any(String));
      expect(body.member).toMatchObject({
        name: 'New Hire',
        email,
        title: 'New member',
        roles: ['member'],
        campusIds: [lekki.id],
        permissions: {},
      });

      const { rows } = await pool.query<{ mustChangePassword: boolean }>(
        'SELECT "mustChangePassword" FROM "user" WHERE email = $1',
        [email]
      );
      expect(rows[0]?.mustChangePassword).toBe(true);

      const hired = await signIn({
        id: body.member.userId,
        email,
        password: body.temporaryPassword ?? '',
        cookie: '',
      });
      const me = await api(hired).get('/me').expect(200);
      expect(me.body.mustChangePassword).toBe(true);
    });

    test('keeps the job title and falls back to New member when blank', async ({
      api,
      schools: { owner, lekki },
    }) => {
      const titled = await api(owner)
        .post('/members')
        .send({
          name: 'Titled',
          email: 'titled@example.test',
          title: 'Head of maths',
          campusIds: [lekki.id],
        })
        .expect(201);
      expect((titled.body as CreateMemberResult).member.title).toBe(
        'Head of maths'
      );
      const blank = await api(owner)
        .post('/members')
        .send({
          name: 'Blank',
          email: 'blank@example.test',
          title: '  ',
          campusIds: [lekki.id],
        })
        .expect(201);
      expect((blank.body as CreateMemberResult).member.title).toBe(
        'New member'
      );
    });

    test('adds an existing account as is and returns no password', async ({
      api,
      createUser,
      schools: { owner, lekki },
    }) => {
      const existing = await createUser({ name: 'Already Here' });
      const res = await api(owner)
        .post('/members')
        .send({
          name: 'Other Name',
          email: existing.email.toUpperCase(),
          campusIds: [lekki.id],
        })
        .expect(201);
      const body = res.body as CreateMemberResult;
      expect(body.temporaryPassword).toBeNull();
      expect(body.member).toMatchObject({
        userId: existing.id,
        name: 'Already Here',
      });
    });

    test('answers 400 for a missing name, email or campus', async ({
      api,
      schools: { owner, lekki },
    }) => {
      const messages = async (body: object) =>
        (
          (await api(owner).post('/members').send(body).expect(400)).body as {
            issues: { message: string }[];
          }
        ).issues.map((issue) => issue.message);
      const valid = {
        name: 'A',
        email: 'a@example.test',
        campusIds: [lekki.id],
      };
      expect(await messages({ ...valid, name: ' ' })).toContain(
        'Enter their full name.'
      );
      expect(await messages({ ...valid, email: '' })).toContain(
        'Enter their email address.'
      );
      expect(await messages({ ...valid, campusIds: [] })).toContain(
        'Choose at least one campus.'
      );
      expect(await messages({ name: 'A', email: 'a@example.test' })).toContain(
        'Choose at least one campus.'
      );
    });

    test('answers 404 for a campus of another school', async ({
      api,
      schools: { owner, campusB },
    }) => {
      const res = await api(owner)
        .post('/members')
        .send({ name: 'A', email: 'a@example.test', campusIds: [campusB.id] })
        .expect(404);
      expect(res.body.message).toBe('Campus not found');
    });

    test('answers 409 for someone already on the staff list and for a super admin', async ({
      api,
      createUser,
      makeSuperAdmin,
      schools: { owner, lekki },
    }) => {
      const body = {
        name: 'Dup',
        email: 'dup@example.test',
        campusIds: [lekki.id],
      };
      await api(owner).post('/members').send(body).expect(201);
      const dup = await api(owner)
        .post('/members')
        .send({ ...body, email: 'DUP@example.test' })
        .expect(409);
      expect(dup.body.message).toBe(
        'dup@example.test is already on the staff list.'
      );

      const root = await makeSuperAdmin(await createUser());
      const res = await api(owner)
        .post('/members')
        .send({ ...body, email: root.email })
        .expect(409);
      expect(res.body.message).toBe(
        `${root.email} can’t be added to this school.`
      );
    });

    test('answers 403 without member:create', async ({
      api,
      withPermissions,
      schools: { orgA, lekki },
    }) => {
      const reader = await withPermissions(orgA, [
        'member:read',
        'member:update',
      ]);
      await api(reader)
        .post('/members')
        .send({ name: 'A', email: 'a@example.test', campusIds: [lekki.id] })
        .expect(403);
    });
  });

  test.describe('permissions', () => {
    test('a bursar is refused on every members route', async ({
      api,
      hire,
      schools: { owner, lekki, lekkiOnly },
    }) => {
      const { member } = await hire(owner, { campusIds: [lekki.id] });
      const id = member.id;
      await api(lekkiOnly).get('/members').expect(403);
      await api(lekkiOnly).get('/members/roles').expect(403);
      await api(lekkiOnly).get(`/members/${id}`).expect(403);
      await api(lekkiOnly)
        .post('/members')
        .send({ name: 'A', email: 'a@example.test', campusIds: [lekki.id] })
        .expect(403);
      await putRoles(api, lekkiOnly, { id, roles: [] }).expect(403);
      await api(lekkiOnly)
        .put(`/members/${id}/campuses`)
        .send({ campusIds: [lekki.id] })
        .expect(403);
      await api(lekkiOnly).delete(`/members/${id}`).expect(403);
    });
  });

  test.describe('escalation', () => {
    test('refuses giving out, removing and removing a member who holds a role the caller lacks', async ({
      api,
      createRole,
      hire,
      withPermissions,
      schools: { orgA, owner, lekki },
    }) => {
      await createRole(orgA, {
        slug: 'cashier',
        label: 'Cashier',
        permissions: ['schoolAccount:update'],
      });
      const manager = await withPermissions(orgA, MANAGER);
      const plain = await hire(owner, { campusIds: [lekki.id] });
      const holder = await hire(owner, { campusIds: [lekki.id] });
      await putRoles(api, owner, {
        id: holder.member.id,
        roles: ['cashier'],
        campusIds: [lekki.id],
      }).expect(200);

      const give = await putRoles(api, manager, {
        id: plain.member.id,
        roles: ['cashier'],
        campusIds: [lekki.id],
      }).expect(403);
      expect(give.body.message).toBe(
        `You can’t give out Cashier: ${ESCALATION}`
      );

      const remove = await putRoles(api, manager, {
        id: holder.member.id,
        roles: [],
        campusIds: [lekki.id],
      }).expect(403);
      expect(remove.body.message).toBe(
        `You can’t remove Cashier: ${ESCALATION}`
      );

      const removeMember = await api(manager)
        .delete(`/members/${holder.member.id}`)
        .expect(403);
      expect(removeMember.body.message).toContain('Cashier');
    });

    test('a refused change leaves roles and campuses unchanged', async ({
      api,
      createRole,
      hire,
      withPermissions,
      schools: { orgA, owner, lekki, ikeja },
    }) => {
      await createRole(orgA, {
        slug: 'cashier',
        label: 'Cashier',
        permissions: ['schoolAccount:update'],
      });
      const manager = await withPermissions(orgA, MANAGER);
      const target = await hire(owner, { campusIds: [lekki.id] });

      await putRoles(api, manager, {
        id: target.member.id,
        roles: ['teacher', 'cashier'],
        campusIds: [ikeja.id],
      }).expect(403);

      const after = (
        await api(owner).get(`/members/${target.member.id}`).expect(200)
      ).body as MemberDetail;
      expect(after.roles).toEqual(['member']);
      expect(after.campusIds).toEqual([lekki.id]);
    });
  });

  test.describe('role rules', () => {
    test('refuses two senior roles', async ({
      api,
      hire,
      schools: { owner, lekki },
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      const res = await putRoles(api, owner, {
        id: target.member.id,
        roles: ['administrator', 'principal'],
      }).expect(409);
      expect(res.body).toEqual({
        code: 'ROLE_COMBINATION',
        message:
          'Administrator and Principal can’t be held by the same person. Choose one senior role.',
      });
    });

    test('refuses a student holding staff roles', async ({
      api,
      hire,
      schools: { owner, lekki },
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      await putRoles(api, owner, {
        id: target.member.id,
        roles: ['student'],
        campusIds: [lekki.id],
      }).expect(200);
      const res = await putRoles(api, owner, {
        id: target.member.id,
        roles: ['student', 'teacher'],
        campusIds: [lekki.id],
      }).expect(409);
      expect(res.body).toMatchObject({
        code: 'ROLE_COMBINATION',
        message: 'A student can’t also hold staff roles (Teacher).',
      });
    });

    test('keeps a portal-only guardian from a school’s own role', async ({
      api,
      createRole,
      hire,
      schools: { orgA, owner, lekki },
    }) => {
      await createRole(orgA, {
        slug: 'front-desk',
        label: 'Front desk',
        permissions: ['student:read'],
      });
      const target = await hire(owner, {
        campusIds: [lekki.id],
        name: 'Mrs Ade',
      });
      await putRoles(api, owner, {
        id: target.member.id,
        roles: ['guardian'],
        campusIds: [lekki.id],
      }).expect(200);
      const res = await putRoles(api, owner, {
        id: target.member.id,
        roles: ['guardian', 'front-desk'],
        campusIds: [lekki.id],
      }).expect(409);
      expect(res.body).toMatchObject({
        code: 'ROLE_COMBINATION',
        message:
          'Mrs Ade is a portal user (student or guardian) and can’t be given Front desk.',
      });
    });

    test('lets a member with no role gain Teacher', async ({
      api,
      hire,
      schools: { owner, lekki },
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      const res = await putRoles(api, owner, {
        id: target.member.id,
        roles: ['teacher'],
        campusIds: [lekki.id],
      }).expect(200);
      expect((res.body as MemberDetail).roles).toEqual(['member', 'teacher']);
    });

    test('refuses owner changes as a handover', async ({
      api,
      addMember,
      createUser,
      hire,
      schools: { orgA, owner, lekki },
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      const added = await putRoles(api, owner, {
        id: target.member.id,
        roles: ['owner'],
      }).expect(409);
      expect(added.body).toEqual({
        code: 'OWNER_BY_HANDOVER',
        message: 'Ownership changes only by handing the school over.',
      });

      const second = await addMember(orgA, await createUser(), {
        roles: ['owner'],
      });
      const removed = await putRoles(api, owner, {
        id: await idOf(api, owner, second.id),
        roles: [],
        campusIds: [lekki.id],
      }).expect(409);
      expect(removed.body.code).toBe('OWNER_BY_HANDOVER');
    });
  });

  test.describe('campuses', () => {
    test('asks for a campus when the draft needs one, and refuses an empty set', async ({
      api,
      hire,
      schools: { owner, lekki },
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      const missing = await putRoles(api, owner, {
        id: target.member.id,
        roles: ['teacher'],
      }).expect(400);
      expect(missing.body.message).toBe('Choose at least one campus.');

      await putRoles(api, owner, {
        id: target.member.id,
        roles: ['teacher'],
        campusIds: [],
      }).expect(400);
      await api(owner)
        .put(`/members/${target.member.id}/campuses`)
        .send({ campusIds: [] })
        .expect(400);
    });

    test('adds and removes campuses and keeps the last one', async ({
      api,
      hire,
      schools: { owner, lekki, ikeja },
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      const added = await api(owner)
        .put(`/members/${target.member.id}/campuses`)
        .send({ campusIds: [lekki.id, ikeja.id] })
        .expect(200);
      expect(
        (added.body as MemberDetail).campusIds.toSorted((a, b) =>
          a.localeCompare(b)
        )
      ).toEqual([lekki.id, ikeja.id].toSorted((a, b) => a.localeCompare(b)));
      const swapped = await api(owner)
        .put(`/members/${target.member.id}/campuses`)
        .send({ campusIds: [ikeja.id] })
        .expect(200);
      expect((swapped.body as MemberDetail).campusIds).toEqual([ikeja.id]);
    });

    test('leaves campuses an editor cannot see untouched', async ({
      api,
      hire,
      withPermissions,
      schools: { orgA, owner, lekki, ikeja },
    }) => {
      const editor = await withPermissions(
        orgA,
        ['member:read', 'member:update'],
        { campuses: [lekki] }
      );
      const target = await hire(owner, { campusIds: [lekki.id, ikeja.id] });
      const res = await api(editor)
        .put(`/members/${target.member.id}/campuses`)
        .send({ campusIds: [lekki.id] })
        .expect(200);
      expect((res.body as MemberDetail).campusIds).toEqual([lekki.id]);
      const full = (
        await api(owner).get(`/members/${target.member.id}`).expect(200)
      ).body as MemberDetail;
      expect(full.campusIds.toSorted((a, b) => a.localeCompare(b))).toEqual(
        [lekki.id, ikeja.id].toSorted((a, b) => a.localeCompare(b))
      );
    });
  });

  test.describe('effect of a change', () => {
    test('shows in the member’s next /me/permissions', async ({
      api,
      hire,
      schools: { owner, lekki },
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      const before = await api(target.user).get('/me/permissions').expect(200);
      expect(before.body.permissions).toEqual({});

      await putRoles(api, owner, {
        id: target.member.id,
        roles: ['teacher'],
        campusIds: [lekki.id],
      }).expect(200);

      const after = await api(target.user).get('/me/permissions').expect(200);
      expect(after.body).toMatchObject({
        roles: ['member', 'teacher'],
        permissions: { student: ['read'] },
        campusScope: [lekki.id],
      });
    });
  });

  test.describe('remove', () => {
    test('refuses removing the only owner, and removing yourself', async ({
      api,
      addMember,
      createUser,
      withPermissions,
      schools: { orgA, owner },
    }) => {
      const ownerMember = await idOf(api, owner, owner.id);
      const detail = await api(owner)
        .get(`/members/${ownerMember}`)
        .expect(200);
      expect((detail.body as MemberDetail).lastOwner).toBe(true);
      const lastOwner = await api(owner)
        .delete(`/members/${ownerMember}`)
        .expect(409);
      expect(lastOwner.body).toEqual({
        code: 'LAST_OWNER',
        message: 'Test User is the school’s only owner and can’t be removed.',
      });

      const manager = await withPermissions(orgA, MANAGER);
      const viaManager = await api(manager)
        .delete(`/members/${ownerMember}`)
        .expect(409);
      expect(viaManager.body.code).toBe('LAST_OWNER');

      await addMember(orgA, await createUser(), { roles: ['owner'] });
      const afterSecond = await api(owner)
        .get(`/members/${ownerMember}`)
        .expect(200);
      expect((afterSecond.body as MemberDetail).lastOwner).toBe(false);
      const self = await api(owner)
        .delete(`/members/${ownerMember}`)
        .expect(409);
      expect(self.body).toEqual({
        code: 'SELF_REMOVAL',
        message: 'You can’t remove yourself from the school.',
      });
    });

    test('refuses a campus-scoped remover when the member also works elsewhere', async ({
      api,
      hire,
      withPermissions,
      schools: { orgA, owner, lekki, ikeja },
    }) => {
      const remover = await withPermissions(
        orgA,
        ['member:read', 'member:delete'],
        { campuses: [lekki] }
      );
      const both = await hire(owner, { campusIds: [lekki.id, ikeja.id] });
      const lekkiOnly = await hire(owner, { campusIds: [lekki.id] });

      const refused = await api(remover)
        .delete(`/members/${both.member.id}`)
        .expect(403);
      expect(refused.body.message).toContain('campuses you can’t see');
      await api(owner).get(`/members/${both.member.id}`).expect(200);

      await api(remover).delete(`/members/${lekkiOnly.member.id}`).expect(200);
    });

    test('deletes the member and campus seats, keeps the user, and the removed member loses the school', async ({
      api,
      pool,
      hire,
      schools: { owner, lekki },
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      await api(target.user).get('/campuses').expect(200);

      const res = await api(owner)
        .delete(`/members/${target.member.id}`)
        .expect(200);
      expect(res.body).toEqual({ id: target.member.id });

      const count = async (sql: string) =>
        (await pool.query<{ n: string }>(sql, [target.user.id])).rows[0]?.n;
      expect(
        await count('SELECT count(*) AS n FROM member WHERE "userId" = $1')
      ).toBe('0');
      expect(
        await count(
          'SELECT count(*) AS n FROM "teamMember" WHERE "userId" = $1'
        )
      ).toBe('0');
      expect(
        await count('SELECT count(*) AS n FROM "user" WHERE id = $1')
      ).toBe('1');

      const refused = await api(target.user).get('/campuses').expect(403);
      expect(refused.body.code).toBe('NoSchool');
      await api(owner).get(`/members/${target.member.id}`).expect(404);
    });
  });

  test.describe('starter role backfill', () => {
    test('gives an unedited Administrator role the member permissions and leaves an edited one', async ({
      pool,
      schools: { orgA, orgB },
    }) => {
      const administrator = STARTER_ROLES.find(
        (role) => role.slug === 'administrator'
      );
      const old = JSON.stringify(
        toPermissionMap(
          (administrator?.permissions ?? []).filter(
            (permission) => !permission.startsWith('member:')
          )
        )
      );
      await pool.query(
        `UPDATE "organizationRole" SET permission = $2, "editedAt" = NULL
         WHERE "organizationId" = $1 AND role = 'administrator'`,
        [orgA.id, old]
      );
      await pool.query(
        `UPDATE "organizationRole" SET permission = $2, "editedAt" = now()
         WHERE "organizationId" = $1 AND role = 'administrator'`,
        [orgB.id, old]
      );

      await syncAllStarterRoles(pool);

      const read = async (organizationId: string) =>
        (
          await pool.query<{ permission: string }>(
            `SELECT permission FROM "organizationRole"
             WHERE "organizationId" = $1 AND role = 'administrator'`,
            [organizationId]
          )
        ).rows[0]?.permission;
      expect(JSON.parse((await read(orgA.id)) ?? '{}')).toMatchObject({
        member: ['read', 'update'],
      });
      expect(await read(orgB.id)).toBe(old);
    });
  });

  test.describe('isolation', () => {
    test('1: another school reads, edits and removes by id as 404', async ({
      api,
      schools: { owner, ownerB, lekkiOnly, lekki },
    }) => {
      const id = await idOf(api, owner, lekkiOnly.id);
      await api(ownerB).get(`/members/${id}`).expect(404);
      await putRoles(api, ownerB, { id, roles: ['teacher'] }).expect(404);
      await api(ownerB)
        .put(`/members/${id}/campuses`)
        .send({ campusIds: [lekki.id] })
        .expect(404);
      await api(ownerB).delete(`/members/${id}`).expect(404);
    });

    test('2: a list holds no member of another school', async ({
      api,
      hire,
      schools: { owner, ownerB, campusB },
    }) => {
      const other = await hire(ownerB, { campusIds: [campusB.id] });
      const mine = await listAll(api, owner);
      expect(mine.map((item) => item.userId)).not.toContain(other.user.id);
      expect(mine.map((item) => item.userId)).not.toContain(ownerB.id);
    });

    test('3: a Lekki-only editor gets 404 for an Ikeja-only member on every route', async ({
      api,
      hire,
      withPermissions,
      schools: { orgA, owner, lekki, ikeja },
    }) => {
      const editor = await withPermissions(
        orgA,
        ['member:read', 'member:update', 'member:delete'],
        { campuses: [lekki] }
      );
      const target = await hire(owner, { campusIds: [ikeja.id] });
      const id = target.member.id;
      await api(editor).get(`/members/${id}`).expect(404);
      await putRoles(api, editor, { id, roles: [] }).expect(404);
      await api(editor)
        .put(`/members/${id}/campuses`)
        .send({ campusIds: [lekki.id] })
        .expect(404);
      await api(editor).delete(`/members/${id}`).expect(404);
    });

    test('4: a Lekki-only viewer lists only members sharing Lekki', async ({
      api,
      hire,
      withPermissions,
      schools: { orgA, owner, lekki, ikeja },
    }) => {
      const viewer = await withPermissions(orgA, ['member:read'], {
        campuses: [lekki],
      });
      const shared = await hire(owner, { campusIds: [lekki.id] });
      const elsewhere = await hire(owner, { campusIds: [ikeja.id] });
      const ids = (await listAll(api, viewer)).map((item) => item.userId);
      expect(ids).toContain(shared.user.id);
      expect(ids).not.toContain(elsewhere.user.id);
    });

    test('5: a member with no permissions gets 403 on every route', async ({
      api,
      hire,
      schools: { owner, noPermission, lekki },
    }) => {
      const { member } = await hire(owner, { campusIds: [lekki.id] });
      await api(noPermission).get('/members').expect(403);
      await api(noPermission).get('/members/roles').expect(403);
      await api(noPermission).get(`/members/${member.id}`).expect(403);
      await api(noPermission)
        .post('/members')
        .send({ name: 'A', email: 'a@example.test', campusIds: [lekki.id] })
        .expect(403);
      await putRoles(api, noPermission, { id: member.id, roles: [] }).expect(
        403
      );
      await api(noPermission)
        .put(`/members/${member.id}/campuses`)
        .send({ campusIds: [lekki.id] })
        .expect(403);
      await api(noPermission).delete(`/members/${member.id}`).expect(403);
    });

    test('6: no session answers 401 on every route', async ({
      api,
      schools: { lekki },
    }) => {
      const id = '00000000-0000-4000-8000-000000000000';
      await api().get('/members').expect(401);
      await api().get('/members/roles').expect(401);
      await api().get(`/members/${id}`).expect(401);
      await api()
        .post('/members')
        .send({ name: 'A', email: 'a@example.test', campusIds: [lekki.id] })
        .expect(401);
      await api().put(`/members/${id}/roles`).send({ roles: [] }).expect(401);
      await api()
        .put(`/members/${id}/campuses`)
        .send({ campusIds: [lekki.id] })
        .expect(401);
      await api().delete(`/members/${id}`).expect(401);
    });

    test('the role catalogue and role slugs stay inside their school', async ({
      api,
      createRole,
      hire,
      schools: { orgA, orgB, owner, ownerB, campusB, lekki },
    }) => {
      await createRole(orgB, {
        slug: 'cashier-b',
        label: 'Cashier B',
        permissions: ['student:read'],
      });
      await createRole(orgA, {
        slug: 'cashier-a',
        label: 'Cashier A',
        permissions: ['student:read'],
      });
      const slugs = async (actor: Actor) =>
        (
          (await api(actor).get('/members/roles').expect(200)).body as {
            slug: string;
          }[]
        ).map((role) => role.slug);
      expect(await slugs(owner)).toContain('cashier-a');
      expect(await slugs(owner)).not.toContain('cashier-b');
      expect(await slugs(ownerB)).toContain('cashier-b');
      expect(await slugs(ownerB)).not.toContain('cashier-a');

      const mine = await hire(owner, { campusIds: [lekki.id] });
      const theirs = await hire(ownerB, { campusIds: [campusB.id] });
      const foreign = await putRoles(api, owner, {
        id: mine.member.id,
        roles: ['cashier-b'],
      }).expect(404);
      expect(foreign.body.message).toBe('Role not found');
      await putRoles(api, ownerB, {
        id: theirs.member.id,
        roles: ['cashier-a'],
      }).expect(404);
    });

    test('7: create and campus updates naming another school’s campus answer 404', async ({
      api,
      hire,
      schools: { owner, lekki, campusB },
    }) => {
      await api(owner)
        .post('/members')
        .send({ name: 'A', email: 'a@example.test', campusIds: [campusB.id] })
        .expect(404);
      const target = await hire(owner, { campusIds: [lekki.id] });
      await api(owner)
        .put(`/members/${target.member.id}/campuses`)
        .send({ campusIds: [campusB.id] })
        .expect(404);
      await putRoles(api, owner, {
        id: target.member.id,
        roles: ['teacher'],
        campusIds: [campusB.id],
      }).expect(404);
    });
  });

  test.describe('acting', () => {
    const REASON = 'SUP-3301 fix a title';

    test('read-only acting lists and opens members across campuses', async ({
      api,
      createUser,
      makeSuperAdmin,
      schools: { orgA, owner, lekkiOnly, ikeja },
      hire,
    }) => {
      const ikejaOnly = await hire(owner, { campusIds: [ikeja.id] });
      const admin = await makeSuperAdmin(await createUser());
      const listed = await api(admin)
        .get('/members')
        .set(acting(orgA.id))
        .expect(200);
      const ids = userIds(listed.body as MemberList);
      expect(ids).toContain(lekkiOnly.id);
      expect(ids).toContain(ikejaOnly.user.id);
      const opened = await api(admin)
        .get(`/members/${ikejaOnly.member.id}`)
        .set(acting(orgA.id))
        .expect(200);
      expect((opened.body as MemberDetail).campusIds).toEqual([ikeja.id]);
      await api(admin).get('/members/roles').set(acting(orgA.id)).expect(200);
    });

    test('without a reason every member write answers 403 ActingReadOnly', async ({
      api,
      createUser,
      makeSuperAdmin,
      schools: { orgA, owner, lekki },
      hire,
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      const admin = await makeSuperAdmin(await createUser());
      const readOnly = { code: 'ActingReadOnly' };
      const post = await api(admin)
        .post('/members')
        .set(acting(orgA.id))
        .send({ name: 'A', email: 'a@example.test', campusIds: [lekki.id] })
        .expect(403);
      expect(post.body).toMatchObject(readOnly);
      const roles = await api(admin)
        .put(`/members/${target.member.id}/roles`)
        .set(acting(orgA.id))
        .send({ roles: ['member', 'teacher'], campusIds: [lekki.id] })
        .expect(403);
      expect(roles.body).toMatchObject(readOnly);
      const campuses = await api(admin)
        .put(`/members/${target.member.id}/campuses`)
        .set(acting(orgA.id))
        .send({ campusIds: [lekki.id] })
        .expect(403);
      expect(campuses.body).toMatchObject(readOnly);
      const removed = await api(admin)
        .delete(`/members/${target.member.id}`)
        .set(acting(orgA.id))
        .expect(403);
      expect(removed.body).toMatchObject(readOnly);
      const after = await api(owner)
        .get(`/members/${target.member.id}`)
        .expect(200);
      expect((after.body as MemberDetail).roles).toEqual(['member']);
    });

    test('with a reason a super admin edits, adds and removes, each audited', async ({
      api,
      pool,
      createUser,
      makeSuperAdmin,
      schools: { orgA, owner, lekki },
      hire,
    }) => {
      const target = await hire(owner, { campusIds: [lekki.id] });
      const admin = await makeSuperAdmin(await createUser());
      const roles = await api(admin)
        .put(`/members/${target.member.id}/roles`)
        .set(acting(orgA.id, REASON))
        .send({ roles: ['member', 'teacher'], campusIds: [lekki.id] })
        .expect(200);
      expect((roles.body as MemberDetail).roles).toEqual(['member', 'teacher']);
      const added = await api(admin)
        .post('/members')
        .set(acting(orgA.id, REASON))
        .send({
          name: 'Added',
          email: 'added@example.test',
          campusIds: [lekki.id],
        })
        .expect(201);
      const created = added.body as CreateMemberResult;
      expect(created.temporaryPassword).toEqual(expect.any(String));
      await api(admin)
        .delete(`/members/${created.member.id}`)
        .set(acting(orgA.id, REASON))
        .expect(200);
      const rows = await waitForAuditRows(pool, { kind: 'acting' }, 3);
      expect(rows.map((row) => [row.method, row.status, row.reason])).toEqual([
        ['PUT', 200, REASON],
        ['POST', 201, REASON],
        ['DELETE', 200, REASON],
      ]);
      expect(rows.every((row) => row.path.startsWith('/members'))).toBe(true);
    });

    test('acting in one school cannot reach another school’s member', async ({
      api,
      createUser,
      makeSuperAdmin,
      schools: { orgA, ownerB, campusB },
      hire,
    }) => {
      const theirs = await hire(ownerB, { campusIds: [campusB.id] });
      const admin = await makeSuperAdmin(await createUser());
      const reasoned = acting(orgA.id, REASON);
      await api(admin)
        .get(`/members/${theirs.member.id}`)
        .set(reasoned)
        .expect(404);
      await putRoles(api, admin, { id: theirs.member.id, roles: ['member'] })
        .set(reasoned)
        .expect(404);
      await api(admin)
        .delete(`/members/${theirs.member.id}`)
        .set(reasoned)
        .expect(404);
    });
  });
});
