import { KYSELY_TOKEN, type Database } from '../src/app/common/db/tokens';
import {
  makeOwner,
  removeMember,
  stripMemberRole,
} from '../src/app/common/auth/member-rows';
import { expect } from './support/base-test';
import { expectSeatsConsistent } from './support/seats';
import { schoolsTest as test } from './support/two-schools';

const rolesOf = async (
  pool: {
    query: (sql: string, values: unknown[]) => Promise<{ rows: unknown[] }>;
  },
  organizationId: string,
  userId: string
) =>
  (
    (await pool.query(
      'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
      [organizationId, userId]
    )) as { rows: { role: string }[] }
  ).rows.map((row) => row.role);

test.describe('the member row writer', () => {
  test('a stripped last role takes the member, their campus seats and their count with it', async ({
    app,
    pool,
    createUser,
    addMember,
    schools: { orgA, lekki, ikeja },
  }) => {
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const guest = await addMember(orgA, await createUser(), {
      roles: ['guardian'],
      campuses: [lekki, ikeja],
    });

    expect(
      await stripMemberRole(db, {
        organizationId: orgA.id,
        userId: guest.id,
        role: 'guardian',
      })
    ).toEqual([]);

    expect(await rolesOf(pool, orgA.id, guest.id)).toEqual([]);
    await expectSeatsConsistent(pool, orgA.id);
  });

  test('a stripped role that leaves another keeps the member and their seats', async ({
    app,
    pool,
    createUser,
    addMember,
    schools: { orgA, lekki },
  }) => {
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const staff = await addMember(orgA, await createUser(), {
      roles: ['bursar', 'guardian'],
      campuses: [lekki],
    });

    expect(
      await stripMemberRole(db, {
        organizationId: orgA.id,
        userId: staff.id,
        role: 'guardian',
      })
    ).toEqual(['bursar']);

    expect(await rolesOf(pool, orgA.id, staff.id)).toEqual(['bursar']);
    await expectSeatsConsistent(pool, orgA.id);
    const seats = await pool.query(
      'SELECT 1 FROM "teamMember" WHERE "userId" = $1',
      [staff.id]
    );
    expect(seats.rows).toHaveLength(1);
  });

  test('removing a member keeps the user and the other members’ seats', async ({
    app,
    pool,
    createUser,
    addMember,
    schools: { orgA, lekki, ikeja },
  }) => {
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const leaving = await addMember(orgA, await createUser(), {
      roles: ['bursar'],
      campuses: [lekki, ikeja],
    });
    const staying = await addMember(orgA, await createUser(), {
      roles: ['bursar'],
      campuses: [lekki],
    });
    const member = await pool.query<{ id: string }>(
      'SELECT id FROM member WHERE "userId" = $1',
      [leaving.id]
    );

    await removeMember(db, {
      organizationId: orgA.id,
      userId: leaving.id,
      memberId: member.rows[0]?.id ?? '',
    });

    await expectSeatsConsistent(pool, orgA.id);
    expect(await rolesOf(pool, orgA.id, leaving.id)).toEqual([]);
    expect(
      (await pool.query('SELECT 1 FROM "user" WHERE id = $1', [leaving.id]))
        .rows
    ).toHaveLength(1);
    expect(
      (
        await pool.query('SELECT 1 FROM "teamMember" WHERE "userId" = $1', [
          staying.id,
        ])
      ).rows
    ).toHaveLength(1);
  });

  test('making an owner adds a new member and keeps an existing member’s other roles', async ({
    app,
    pool,
    createUser,
    addMember,
    schools: { orgA },
  }) => {
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const outsider = await createUser();
    const staff = await addMember(orgA, await createUser(), {
      roles: ['bursar'],
    });

    await makeOwner(db, { organizationId: orgA.id, userId: outsider.id });
    await makeOwner(db, { organizationId: orgA.id, userId: staff.id });

    expect(await rolesOf(pool, orgA.id, outsider.id)).toEqual(['owner']);
    expect(await rolesOf(pool, orgA.id, staff.id)).toEqual(['bursar,owner']);
  });
});
