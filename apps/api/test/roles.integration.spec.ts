import {
  MAX_ROLES_PER_SCHOOL,
  STARTER_ROLES,
  toPermissionMap,
} from '@eduvault/policy';
import type { MemberDetail, Role, RoleList } from '@eduvault/api-contract';
import { syncAllStarterRoles } from '../src/app/common/auth/starter-roles';
import { acting, baseTest, expect, type Fixtures } from './support/base-test';
import { twoSchools, type TwoSchools } from './support/two-schools';

type Actor = NonNullable<Parameters<Fixtures['api']>[0]>;
type Api = Fixtures['api'];

const test = baseTest.extend<{ schools: TwoSchools }>({
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
});

const listRoles = async (api: Api, actor: Actor): Promise<Role[]> => {
  const res = await api(actor).get('/roles').expect(200);
  return (res.body as RoleList).items;
};

const roleOf = async (api: Api, actor: Actor, slug: string): Promise<Role> => {
  const res = await api(actor).get(`/roles/${slug}`).expect(200);
  return res.body as Role;
};

const memberRole = async (
  pool: Fixtures['pool'],
  userId: string
): Promise<string | undefined> =>
  (
    await pool.query<{ role: string }>(
      'SELECT role FROM member WHERE "userId" = $1',
      [userId]
    )
  ).rows[0]?.role;

const ROLE_PATHS = [
  'create-role',
  'update-role',
  'delete-role',
  'list-roles',
  'get-role',
] as const;

test.describe('roles', () => {
  test.describe('isolation', () => {
    test('1: another school reads, edits and removes a custom role by slug as 404', async ({
      api,
      createRole,
      schools: { orgA, ownerB },
    }) => {
      await createRole(orgA, {
        slug: 'cashier',
        permissions: ['student:read'],
      });
      await api(ownerB).get('/roles/cashier').expect(404);
      const patched = await api(ownerB)
        .patch('/roles/cashier')
        .send({ label: 'Mine now' })
        .expect(404);
      expect(patched.body.message).toBe('Role not found');
      await api(ownerB).delete('/roles/cashier').expect(404);
    });

    test('2: a school never lists another school’s role', async ({
      api,
      createRole,
      schools: { owner, orgA, orgB, ownerB },
    }) => {
      await createRole(orgA, { slug: 'only-a', permissions: [] });
      await createRole(orgB, { slug: 'only-b', permissions: [] });
      const slugsA = (await listRoles(api, owner)).map((role) => role.slug);
      const slugsB = (await listRoles(api, ownerB)).map((role) => role.slug);
      expect(slugsA).toContain('only-a');
      expect(slugsA).not.toContain('only-b');
      expect(slugsB).toContain('only-b');
      expect(slugsB).not.toContain('only-a');
    });

    test('2: another school’s holders never count toward a role', async ({
      api,
      schools: { owner, ownerB },
    }) => {
      const mine = await roleOf(api, owner, 'bursar');
      const theirs = await roleOf(api, ownerB, 'bursar');
      expect(mine.holderCount).toBe(1);
      expect(theirs.holderCount).toBe(0);
      expect(theirs.holders).toEqual([]);
    });

    test('7: another school can take a label and slug a school already holds', async ({
      api,
      createRole,
      schools: { orgA, ownerB },
    }) => {
      await createRole(orgA, {
        slug: 'cashier',
        label: 'Cashier',
        permissions: [],
      });
      const res = await api(ownerB)
        .post('/roles')
        .send({ label: 'cashier', permissions: {} })
        .expect(201);
      expect(res.body).toMatchObject({ slug: 'cashier', label: 'cashier' });
    });

    test('5: a member without ac permissions is refused on every route', async ({
      api,
      schools: { noPermission },
    }) => {
      await api(noPermission).get('/roles').expect(403);
      await api(noPermission).get('/roles/bursar').expect(403);
      await api(noPermission)
        .post('/roles')
        .send({ label: 'X', permissions: {} })
        .expect(403);
      await api(noPermission)
        .patch('/roles/bursar')
        .send({ label: 'X' })
        .expect(403);
      await api(noPermission).delete('/roles/bursar').expect(403);
    });

    test('6: no session answers 401 on every route', async ({ api }) => {
      await api().get('/roles').expect(401);
      await api().get('/roles/bursar').expect(401);
      await api()
        .post('/roles')
        .send({ label: 'X', permissions: {} })
        .expect(401);
      await api().patch('/roles/bursar').send({ label: 'X' }).expect(401);
      await api().delete('/roles/bursar').expect(401);
    });

    test('12: a super admin acting without a reason can read but not write', async ({
      api,
      createUser,
      makeSuperAdmin,
      schools: { orgA },
    }) => {
      const admin = await makeSuperAdmin(await createUser());
      const read = await api(admin)
        .get('/roles')
        .set(acting(orgA.id))
        .expect(200);
      expect(
        (read.body as RoleList).items.every((role) => !role.editable)
      ).toBe(true);
      const res = await api(admin)
        .post('/roles')
        .set(acting(orgA.id))
        .send({ label: 'Sneaky', permissions: {} })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'ActingReadOnly' });
    });

    test('12: a super admin acting with a reason can create a role', async ({
      api,
      createUser,
      makeSuperAdmin,
      schools: { orgA, owner },
    }) => {
      const admin = await makeSuperAdmin(await createUser());
      await api(admin)
        .post('/roles')
        .set(acting(orgA.id, 'SUP-9 add a cashier role'))
        .send({ label: 'Cashier', permissions: { student: ['read'] } })
        .expect(201);
      expect((await roleOf(api, owner, 'cashier')).source).toBe('custom');
    });
  });

  test.describe('reads', () => {
    test('lists Owner and Member, then ready-made roles in seed order, then own roles', async ({
      api,
      createRole,
      schools: { owner, orgA },
    }) => {
      await createRole(orgA, { slug: 'first-own', permissions: [] });
      await createRole(orgA, { slug: 'second-own', permissions: [] });
      const roles = await listRoles(api, owner);
      expect(roles.map((role) => role.slug)).toEqual([
        'owner',
        'member',
        ...STARTER_ROLES.map((role) => role.slug),
        'first-own',
        'second-own',
      ]);
      expect(roles.slice(0, 2).map((role) => role.source)).toEqual([
        'code',
        'code',
      ]);
      expect(
        roles.every((role) => role.editable === (role.source !== 'code'))
      ).toBe(true);
    });

    test('names holders with member:read and gives only counts without it', async ({
      api,
      schools: { owner, orgA },
      withPermissions,
    }) => {
      const bursar = await roleOf(api, owner, 'bursar');
      expect(bursar.holderCount).toBe(1);
      expect(bursar.holders).toHaveLength(1);
      expect(bursar.holders?.[0]?.roles).toEqual(['bursar']);

      const reader = await withPermissions(orgA, ['ac:read']);
      const blind = await roleOf(api, reader, 'bursar');
      expect(blind.holderCount).toBe(1);
      expect(blind.holders).toBeUndefined();
      const everyone = await listRoles(api, reader);
      expect(everyone.every((role) => role.holders === undefined)).toBe(true);
    });

    test('names only holders on the caller’s campuses, counts everyone, and hides pupils', async ({
      api,
      addMember,
      createUser,
      schools: { orgA, lekki, ikeja },
      withPermissions,
    }) => {
      await addMember(orgA, await createUser({ name: 'Ike Jaiyeola' }), {
        roles: ['bursar'],
        campuses: [ikeja],
      });
      await addMember(orgA, await createUser({ name: 'Lekki Pupil' }), {
        roles: ['student'],
        campuses: [lekki],
      });
      const reader = await withPermissions(
        orgA,
        ['ac:read', 'member:read', 'student:read'],
        { campuses: [lekki] }
      );

      const bursar = await roleOf(api, reader, 'bursar');
      expect(bursar.holderCount).toBe(2);
      expect(bursar.holders).toHaveLength(1);
      expect(bursar.holders?.map((holder) => holder.name)).not.toContain(
        'Ike Jaiyeola'
      );

      const everyone = await roleOf(api, reader, 'member');
      const names = (everyone.holders ?? []).map((holder) => holder.name);
      expect(everyone.holderCount).toBeGreaterThan(names.length);
      expect(names).not.toContain('Ike Jaiyeola');
      expect(names).not.toContain('Lekki Pupil');

      const pupils = await roleOf(api, reader, 'student');
      expect(pupils.holders?.map((holder) => holder.name)).toEqual([
        'Lekki Pupil',
      ]);
    });

    test('the bursar is refused on every route', async ({
      api,
      schools: { lekkiOnly },
    }) => {
      await api(lekkiOnly).get('/roles').expect(403);
      await api(lekkiOnly).get('/roles/bursar').expect(403);
      await api(lekkiOnly)
        .post('/roles')
        .send({ label: 'X', permissions: {} })
        .expect(403);
      await api(lekkiOnly)
        .patch('/roles/bursar')
        .send({ label: 'X' })
        .expect(403);
      await api(lekkiOnly).delete('/roles/bursar').expect(403);
    });

    test('the administrator reads every role and can edit none of them', async ({
      api,
      addMember,
      createUser,
      schools: { orgA },
    }) => {
      const administrator = await addMember(orgA, await createUser(), {
        roles: ['administrator'],
      });
      const roles = await listRoles(api, administrator);
      expect(roles.every((role) => !role.editable)).toBe(true);
      await api(administrator)
        .post('/roles')
        .send({ label: 'X', permissions: {} })
        .expect(403);
      await api(administrator)
        .patch('/roles/bursar')
        .send({ label: 'X' })
        .expect(403);
      await api(administrator).delete('/roles/bursar').expect(403);
    });

    test('gives an unedited Administrator role ac:read on boot sync and leaves an edited one', async ({
      api,
      pool,
      schools: { orgA, orgB, owner, ownerB },
    }) => {
      const administrator = STARTER_ROLES.find(
        (role) => role.slug === 'administrator'
      );
      const old = JSON.stringify(
        toPermissionMap(
          (administrator?.permissions ?? []).filter(
            (permission) => !permission.startsWith('ac:')
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

      expect(
        (await roleOf(api, owner, 'administrator')).permissions.ac
      ).toEqual(['read']);
      expect(
        (await roleOf(api, ownerB, 'administrator')).permissions.ac
      ).toBeUndefined();
    });
  });

  test.describe('create', () => {
    test('creates a custom role with a derived slug, and trims and nulls the text', async ({
      api,
      schools: { owner },
    }) => {
      const res = await api(owner)
        .post('/roles')
        .send({
          label: '  Fees Approver ',
          description: '   ',
          permissions: { student: ['read'], team: ['read'] },
        })
        .expect(201);
      expect(res.body).toMatchObject({
        slug: 'fees-approver',
        label: 'Fees Approver',
        description: null,
        source: 'custom',
        holderCount: 0,
        editable: true,
        permissions: { student: ['read'], team: ['read'] },
      });
      expect((await roleOf(api, owner, 'fees-approver')).label).toBe(
        'Fees Approver'
      );
    });

    test('suffixes a derived slug that is taken and ignores a taken or invalid given slug', async ({
      api,
      schools: { owner },
    }) => {
      const first = await api(owner)
        .post('/roles')
        .send({ label: 'Front desk', permissions: {} })
        .expect(201);
      const second = await api(owner)
        .post('/roles')
        .send({ label: 'Front-desk!', permissions: {} })
        .expect(201);
      expect(first.body.slug).toBe('front-desk');
      expect(second.body.slug).toBe('front-desk-2');
      const given = await api(owner)
        .post('/roles')
        .send({ label: 'Hall monitor', permissions: {}, slug: 'teacher' })
        .expect(201);
      expect(given.body.slug).toBe('hall-monitor');
      await api(owner)
        .post('/roles')
        .send({ label: 'Other', permissions: {}, slug: 'admin' })
        .expect(400);
    });

    test('refuses a label that is taken ignoring case, Owner and Member included', async ({
      api,
      schools: { owner },
    }) => {
      for (const label of ['bursar', 'BURSAR', 'owner', 'Member']) {
        const res = await api(owner)
          .post('/roles')
          .send({ label, permissions: {} })
          .expect(409);
        expect(res.body).toMatchObject({
          code: 'ROLE_LABEL_TAKEN',
          message: `A role called ${label} already exists.`,
        });
      }
    });

    test('limits the name to 40 and the description to 200 characters', async ({
      api,
      schools: { owner },
    }) => {
      await api(owner)
        .post('/roles')
        .send({ label: 'a'.repeat(41), permissions: {} })
        .expect(400);
      await api(owner)
        .post('/roles')
        .send({ label: 'Fine', description: 'd'.repeat(201), permissions: {} })
        .expect(400);
      await api(owner)
        .post('/roles')
        .send({ label: '   ', permissions: {} })
        .expect(400);
      await api(owner)
        .post('/roles')
        .send({
          label: 'a'.repeat(40),
          description: 'd'.repeat(200),
          permissions: {},
        })
        .expect(201);
    });

    test('refuses a permission that is not listed', async ({
      api,
      schools: { owner },
    }) => {
      await api(owner)
        .post('/roles')
        .send({ label: 'X', permissions: { student: ['delete'] } })
        .expect(400);
      await api(owner)
        .post('/roles')
        .send({ label: 'X', permissions: { invitation: ['create'] } })
        .expect(400);
    });

    test('refuses permissions the creator does not hold and lists them', async ({
      api,
      schools: { orgA },
      withPermissions,
    }) => {
      const creator = await withPermissions(orgA, [
        'ac:create',
        'student:read',
      ]);
      const res = await api(creator)
        .post('/roles')
        .send({
          label: 'Too much',
          permissions: {
            student: ['read'],
            member: ['create'],
            team: ['read'],
          },
        })
        .expect(403);
      expect(res.body).toEqual({
        code: 'ROLE_ESCALATION',
        message:
          'You can’t give access you don’t have yourself. Switch those parts off and save again.',
        issues: [
          { path: 'team:read', message: 'Campuses: read' },
          { path: 'member:create', message: 'Staff: create' },
        ],
      });
      await api(creator)
        .post('/roles')
        .send({ label: 'Fine', permissions: { student: ['read'] } })
        .expect(201);
    });

    test('refuses the 51st row, counting ready-made roles', async ({
      api,
      createRole,
      schools: { owner, orgA },
    }) => {
      const customRows = MAX_ROLES_PER_SCHOOL - STARTER_ROLES.length;
      for (let n = 0; n < customRows; n++) {
        await createRole(orgA, { slug: `role-${n}`, permissions: [] });
      }
      const res = await api(owner)
        .post('/roles')
        .send({ label: 'One too many', permissions: {} })
        .expect(400);
      expect(res.body.code).toBe('TOO_MANY_ROLES');
    });
  });

  test.describe('update', () => {
    test('renames and changes permissions, sets editedAt, keeps the slug', async ({
      api,
      pool,
      createRole,
      schools: { owner, orgA },
    }) => {
      await createRole(orgA, {
        slug: 'cashier',
        label: 'Cashier',
        permissions: ['student:read'],
      });
      const res = await api(owner)
        .patch('/roles/cashier')
        .send({
          label: 'Till',
          description: 'Takes cash',
          permissions: { student: ['read', 'create'] },
        })
        .expect(200);
      expect(res.body).toMatchObject({
        slug: 'cashier',
        label: 'Till',
        description: 'Takes cash',
        permissions: { student: ['read', 'create'] },
      });
      const { rows } = await pool.query<{
        editedAt: Date | null;
        role: string;
      }>(
        `SELECT role, "editedAt" FROM "organizationRole"
         WHERE "organizationId" = $1 AND role = 'cashier'`,
        [orgA.id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.editedAt).not.toBeNull();
    });

    test('an edited ready-made role is no longer rewritten on boot', async ({
      api,
      pool,
      schools: { owner },
    }) => {
      await api(owner)
        .patch('/roles/teacher')
        .send({ permissions: { student: ['read', 'create'] } })
        .expect(200);
      await syncAllStarterRoles(pool);
      expect((await roleOf(api, owner, 'teacher')).permissions.student).toEqual(
        ['read', 'create']
      );
    });

    test('rename keeps member.role and the holders', async ({
      api,
      pool,
      addMember,
      createRole,
      createUser,
      schools: { owner, orgA, lekki },
    }) => {
      await createRole(orgA, {
        slug: 'fees-approver',
        label: 'Fees approver',
        permissions: ['student:read'],
      });
      const holder = await addMember(orgA, await createUser(), {
        roles: ['fees-approver'],
        campuses: [lekki],
      });
      await api(owner)
        .patch('/roles/fees-approver')
        .send({ label: 'Head of approvals' })
        .expect(200);
      expect(await memberRole(pool, holder.id)).toBe('fees-approver');
      const role = await roleOf(api, owner, 'fees-approver');
      expect(role.label).toBe('Head of approvals');
      expect(role.holderCount).toBe(1);
    });

    test('answers 409 for Owner and Member and never changes them', async ({
      api,
      schools: { owner },
    }) => {
      for (const slug of ['owner', 'member']) {
        const res = await api(owner)
          .patch(`/roles/${slug}`)
          .send({ label: 'Boss' })
          .expect(409);
        expect(res.body.code).toBe('BUILT_IN_ROLE');
      }
    });

    test('refuses a label another role has, but not the role’s own', async ({
      api,
      schools: { owner },
    }) => {
      const res = await api(owner)
        .patch('/roles/teacher')
        .send({ label: 'bursar' })
        .expect(409);
      expect(res.body.code).toBe('ROLE_LABEL_TAKEN');
      await api(owner)
        .patch('/roles/teacher')
        .send({ label: 'TEACHER' })
        .expect(200);
    });

    test('refuses permissions the editor does not hold, and a role holding some they lack', async ({
      api,
      createRole,
      schools: { orgA },
      withPermissions,
    }) => {
      await createRole(orgA, {
        slug: 'wide',
        permissions: ['student:read', 'team:read'],
      });
      await createRole(orgA, { slug: 'narrow', permissions: ['student:read'] });
      const editor = await withPermissions(orgA, ['ac:update', 'student:read']);

      const adding = await api(editor)
        .patch('/roles/narrow')
        .send({ permissions: { student: ['read'], member: ['create'] } })
        .expect(403);
      expect(adding.body.code).toBe('ROLE_ESCALATION');
      expect(adding.body.issues).toEqual([
        { path: 'member:create', message: 'Staff: create' },
      ]);

      const rename = await api(editor)
        .patch('/roles/wide')
        .send({ label: 'Renamed' })
        .expect(403);
      expect(rename.body.issues).toEqual([
        { path: 'team:read', message: 'Campuses: read' },
      ]);
      await api(editor)
        .patch('/roles/wide')
        .send({ permissions: { student: ['read'] } })
        .expect(403);

      await api(editor)
        .patch('/roles/narrow')
        .send({ label: 'Slim' })
        .expect(200);
    });

    test('the role page reports a role the viewer does not fully hold as not editable', async ({
      api,
      createRole,
      schools: { orgA },
      withPermissions,
    }) => {
      await createRole(orgA, {
        slug: 'wide',
        permissions: ['student:read', 'team:read'],
      });
      const editor = await withPermissions(orgA, [
        'ac:read',
        'ac:update',
        'student:read',
      ]);
      expect((await roleOf(api, editor, 'wide')).editable).toBe(false);
      expect((await roleOf(api, editor, 'teacher')).editable).toBe(true);
    });

    test('a permission change reaches the holder on their next request', async ({
      api,
      schools: { owner, lekkiOnly },
    }) => {
      await api(lekkiOnly).get('/students').expect(200);
      await api(owner)
        .patch('/roles/bursar')
        .send({ permissions: {} })
        .expect(200);
      await api(lekkiOnly).get('/students').expect(403);
      await api(owner)
        .patch('/roles/bursar')
        .send({ permissions: { student: ['read'] } })
        .expect(200);
      await api(lekkiOnly).get('/students').expect(200);
    });
  });

  test.describe('delete', () => {
    test('answers 409 for Owner and Member', async ({
      api,
      schools: { owner },
    }) => {
      for (const slug of ['owner', 'member']) {
        const res = await api(owner).delete(`/roles/${slug}`).expect(409);
        expect(res.body.code).toBe('BUILT_IN_ROLE');
      }
    });

    test('answers 409 for Student and Guardian even when nobody holds them', async ({
      api,
      schools: { owner },
    }) => {
      for (const slug of ['student', 'guardian']) {
        const res = await api(owner).delete(`/roles/${slug}`).expect(409);
        expect(res.body).toMatchObject({
          code: 'ROLE_PROTECTED',
          message: 'Admissions use this role.',
        });
      }
    });

    test('refuses a role someone holds and names them, then deletes once it is free', async ({
      api,
      addMember,
      createRole,
      createUser,
      schools: { owner, orgA, lekki },
    }) => {
      await createRole(orgA, {
        slug: 'fees-approver',
        label: 'Fees approver',
        permissions: ['student:read'],
      });
      await addMember(orgA, await createUser({ name: 'Kemi Adeyemi' }), {
        roles: ['fees-approver'],
        campuses: [lekki],
      });
      const refused = await api(owner)
        .delete('/roles/fees-approver')
        .expect(409);
      expect(refused.body).toMatchObject({
        code: 'ROLE_IN_USE',
        message: 'Kemi Adeyemi still has this role. Take it off them first.',
      });

      const members = await api(owner).get('/members?q=Kemi').expect(200);
      const id = (members.body as { items: MemberDetail[] }).items[0]?.id;
      await api(owner)
        .put(`/members/${id}/roles`)
        .send({ roles: [], campusIds: [lekki.id] })
        .expect(200);
      const deleted = await api(owner)
        .delete('/roles/fees-approver')
        .expect(200);
      expect(deleted.body).toEqual({ slug: 'fees-approver' });
      await api(owner).get('/roles/fees-approver').expect(404);
    });

    test('gives only a count, and still refuses, when a holder is on another campus', async ({
      api,
      addMember,
      createUser,
      schools: { orgA, ikeja, lekki },
      withPermissions,
    }) => {
      const deleter = await withPermissions(
        orgA,
        ['ac:delete', 'member:read', 'student:read'],
        { campuses: [lekki] }
      );
      await addMember(orgA, await createUser({ name: 'Ike Jaiyeola' }), {
        roles: ['bursar'],
        campuses: [ikeja],
      });
      const res = await api(deleter).delete('/roles/bursar').expect(409);
      expect(res.body.code).toBe('ROLE_IN_USE');
      expect(res.body.message).toBe(
        '2 people still have this role. Take it off them first.'
      );
    });

    test('gives only a count to someone without member:read', async ({
      api,
      schools: { orgA },
      withPermissions,
    }) => {
      const deleter = await withPermissions(orgA, [
        'ac:delete',
        'student:read',
      ]);
      const res = await api(deleter).delete('/roles/bursar').expect(409);
      expect(res.body.message).toBe(
        '1 person still has this role. Take it off them first.'
      );
    });

    test('refuses a role the deleter does not fully hold', async ({
      api,
      createRole,
      schools: { orgA },
      withPermissions,
    }) => {
      await createRole(orgA, {
        slug: 'wide',
        permissions: ['student:read', 'team:read'],
      });
      const deleter = await withPermissions(orgA, [
        'ac:delete',
        'student:read',
      ]);
      const res = await api(deleter).delete('/roles/wide').expect(403);
      expect(res.body.code).toBe('ROLE_ESCALATION');
    });
  });

  test.describe('Better Auth role routes', () => {
    test('are not served', async ({ api, schools: { owner } }) => {
      for (const path of ROLE_PATHS) {
        const route = `/api/auth/organization/${path}`;
        const read = path === 'list-roles' || path === 'get-role';
        const res = read
          ? await api(owner).get(`${route}?roleName=bursar`)
          : await api(owner).post(route).send({ role: 'bursar' });
        expect(res.status, route).toBe(404);
      }
    });
  });
});
