import {
  ALREADY_DECIDED_MESSAGE,
  LEAVE_STAFF_ONLY_MESSAGE,
  LEAVE_TOO_LONG_MESSAGE,
  LEAVE_NO_SCHOOL_DAY_MESSAGE,
  LEAVE_OVERLAP_MESSAGE,
  LEAVE_PAST_START_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  type ApprovalList,
  type LeaveDto,
  type MemberList,
  type MyLeave,
  type Role,
} from '@eduvault/api-contract';
import { STARTER_ROLES, toPermissionMap } from '@eduvault/policy';
import { syncAllStarterRoles } from '../src/app/common/auth/starter-roles';
import {
  acting,
  expect,
  waitForAuditRows,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import { askLeave, approveLeave } from './support/factories/leave';
import { termOf } from './support/factories/terms';
import { family, guardianOf, signInAs, studentOf } from './support/portal';
import { schoolsTest as test } from './support/two-schools';

type Api = Fixtures['api'];

const TODAY = '2026-10-12';

const mineOf = async (api: Api, actor: TestUser): Promise<MyLeave> =>
  (await api(actor).get('/me/leave').expect(200)).body as MyLeave;

const queueOf = async (
  api: Api,
  actor: TestUser,
  query = ''
): Promise<LeaveDto[]> =>
  (await api(actor).get(`/leave${query}`).expect(200)).body as LeaveDto[];

const addHoliday = async (
  api: Api,
  owner: TestUser,
  date: string
): Promise<void> => {
  const term = await termOf(api, owner, { year: '2026/2027', sequence: 1 });
  await api(owner)
    .post(`/terms/${term.id}/holidays`)
    .send({ date, name: 'Mid-term break' })
    .expect(201);
};

const byText = (a: string, b: string) => a.localeCompare(b);

const roleOf = async (api: Api, actor: TestUser, slug: string): Promise<Role> =>
  (await api(actor).get(`/roles/${slug}`).expect(200)).body as Role;

test.beforeEach(({ clock }) => {
  clock.set(TODAY);
});

test.describe('requesting leave', () => {
  test('a teacher asks for a day, sees it waiting and the school’s figures', async ({
    api,
    addMember,
    createUser,
    schools: { orgA, lekki },
  }) => {
    const emeka = await addMember(
      orgA,
      await createUser({ name: 'Emeka Obi' }),
      {
        roles: ['teacher'],
        campuses: [lekki],
      }
    );

    const leave = await askLeave(api, emeka, { type: 'annual' });

    expect(leave).toMatchObject({
      type: 'annual',
      startsOn: '2026-10-22',
      endsOn: '2026-10-22',
      days: 1,
      status: 'submitted',
      requesterName: 'Emeka Obi',
      isOwn: true,
      cover: null,
      deciderName: null,
    });
    const mine = await mineOf(api, emeka);
    expect(mine).toMatchObject({
      daysTakenThisYear: 0,
      waiting: 1,
      otherApproverExists: true,
      schoolYearLabel: '2026/2027',
      nextTimeOff: null,
    });
    expect(mine.items.map((item) => item.id)).toEqual([leave.id]);
    expect(mine.oldestWaitingSentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(mine.holidays)).toBe(true);
  });

  test('refuses leave that runs for more than a year', async ({
    api,
    schools: { owner },
  }) => {
    const res = await api(owner)
      .post('/leave')
      .send({
        type: 'annual',
        reason: 'Sabbatical',
        startsOn: '2026-10-22',
        endsOn: '9999-12-31',
      })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain(LEAVE_TOO_LONG_MESSAGE);
  });

  test('subtracts school holidays and refuses a weekend or holiday only', async ({
    api,
    schools: { owner },
  }) => {
    await addHoliday(api, owner, '2026-10-21');

    const week = await askLeave(api, owner, {
      startsOn: '2026-10-19',
      endsOn: '2026-10-23',
    });
    expect(week.days).toBe(4);

    for (const dates of [
      { startsOn: '2026-10-24', endsOn: '2026-10-25' },
      { startsOn: '2026-10-21', endsOn: '2026-10-21' },
    ]) {
      const res = await api(owner)
        .post('/leave')
        .send({ type: 'sick', reason: 'Unwell', ...dates })
        .expect(400);
      expect(res.body.message).toBe(LEAVE_NO_SCHOOL_DAY_MESSAGE);
    }
  });

  test('refuses a first day before today and a last day before the first', async ({
    api,
    schools: { owner },
  }) => {
    const past = await api(owner)
      .post('/leave')
      .send({ type: 'annual', startsOn: '2026-10-09', reason: 'Trip' })
      .expect(400);
    expect(past.body.message).toBe(LEAVE_PAST_START_MESSAGE);

    const reversed = await api(owner)
      .post('/leave')
      .send({
        type: 'annual',
        startsOn: '2026-10-22',
        endsOn: '2026-10-21',
        reason: 'Trip',
      })
      .expect(400);
    expect(JSON.stringify(reversed.body)).toContain(
      'The last day can’t be before the first day.'
    );

    await api(owner)
      .post('/leave')
      .send({ type: 'annual', startsOn: '2026-10-22', reason: '  ' })
      .expect(400);
  });

  test('refuses an overlap with waiting or approved leave but not with withdrawn leave', async ({
    api,
    schools: { owner, lekkiOnly },
  }) => {
    const first = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    const clash = await api(lekkiOnly)
      .post('/leave')
      .send({
        type: 'annual',
        startsOn: '2026-10-21',
        endsOn: '2026-10-23',
        reason: 'Again',
      })
      .expect(409);
    expect(clash.body.message).toBe(LEAVE_OVERLAP_MESSAGE);

    await approveLeave(api, owner, first.id);
    await api(lekkiOnly)
      .post('/leave')
      .send({ type: 'annual', startsOn: '2026-10-22', reason: 'Again' })
      .expect(409);

    const other = await askLeave(api, lekkiOnly, { startsOn: '2026-11-02' });
    await api(lekkiOnly).post(`/leave/${other.id}/withdraw`).expect(200);
    await askLeave(api, lekkiOnly, { startsOn: '2026-11-02' });
  });

  test('stops the exclusion constraint from admitting an overlap behind the service', async ({
    api,
    pool,
    schools: { lekkiOnly },
  }) => {
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    await expect(
      pool.query(
        `INSERT INTO staff_leave (organization_id, type, starts_on, ends_on, reason, created_by)
         SELECT organization_id, 'sick', '2026-10-22', '2026-10-23', 'Race', created_by
         FROM staff_leave WHERE id = $1`,
        [leave.id]
      )
    ).rejects.toMatchObject({
      code: '23P01',
      constraint: 'staff_leave_no_overlap',
    });
  });

  test('lets a member with no roles ask and keeps students and guardians out', async ({
    api,
    app,
    schools: { noPermission, owner, lekki, ikeja },
  }) => {
    await askLeave(api, noPermission);

    const { ada } = await family(app, { owner, lekki, ikeja });
    const student = await signInAs(api, studentOf(ada.logins));
    const guardian = await signInAs(api, guardianOf(ada.logins));
    for (const portal of [student, guardian]) {
      await api(portal)
        .post('/leave')
        .send({ type: 'annual', startsOn: '2026-10-22', reason: 'Trip' })
        .expect(403);
      await api(portal).get('/me/leave').expect(403);
    }
  });

  test('keeps a cover note and ignores a requester or school sent in the body', async ({
    api,
    pool,
    schools: { lekkiOnly, orgA, orgB, ownerB },
  }) => {
    const res = await api(lekkiOnly)
      .post('/leave')
      .send({
        type: 'study',
        startsOn: '2026-10-22',
        reason: 'Exam',
        cover: '  Ayo takes JSS 2  ',
        createdBy: ownerB.id,
        organizationId: orgB.id,
      })
      .expect(201);
    expect((res.body as LeaveDto).cover).toBe('Ayo takes JSS 2');

    const { rows } = await pool.query<{
      organization_id: string;
      created_by: string;
    }>('SELECT organization_id, created_by FROM staff_leave WHERE id = $1', [
      (res.body as LeaveDto).id,
    ]);
    expect(rows[0]).toEqual({
      organization_id: orgA.id,
      created_by: lekkiOnly.id,
    });
  });
});

test.describe('withdrawing leave', () => {
  test('only the requester, only while waiting', async ({
    api,
    schools: { owner, lekkiOnly, noPermission },
  }) => {
    const waiting = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    const approved = await askLeave(api, lekkiOnly, { startsOn: '2026-10-29' });
    await approveLeave(api, owner, approved.id);

    await api(noPermission).post(`/leave/${waiting.id}/withdraw`).expect(404);
    await api(owner).post(`/leave/${waiting.id}/withdraw`).expect(404);

    const withdrawn = await api(lekkiOnly)
      .post(`/leave/${waiting.id}/withdraw`)
      .expect(200);
    expect((withdrawn.body as LeaveDto).status).toBe('cancelled');
    await api(lekkiOnly).post(`/leave/${waiting.id}/withdraw`).expect(409);
    await api(lekkiOnly).post(`/leave/${approved.id}/withdraw`).expect(409);
    expect(await queueOf(api, owner)).toEqual([]);
  });
});

test.describe('deciding leave', () => {
  test('a principal approves and declines in scope; staff outside it are absent and answer 404', async ({
    api,
    addMember,
    createUser,
    withPermissions,
    schools: { orgA, lekki, ikeja },
  }) => {
    const lekkiPrincipal = await withPermissions(orgA, ['leave:approve'], {
      campuses: [lekki],
    });
    const emeka = await addMember(
      orgA,
      await createUser({ name: 'Emeka Obi' }),
      {
        roles: ['teacher'],
        campuses: [lekki],
      }
    );
    const ayo = await addMember(
      orgA,
      await createUser({ name: 'Ayo Bassey' }),
      {
        roles: ['teacher'],
        campuses: [ikeja],
      }
    );
    const near = await askLeave(api, emeka, {
      type: 'sick',
      startsOn: '2026-10-12',
      endsOn: '2026-10-13',
    });
    const nearTwo = await askLeave(api, emeka, {
      type: 'personal',
      startsOn: '2026-10-20',
    });
    const far = await askLeave(api, ayo, { startsOn: '2026-10-22' });

    expect(
      (await queueOf(api, lekkiPrincipal)).map((l) => l.id).toSorted(byText)
    ).toEqual([near.id, nearTwo.id].toSorted(byText));
    await api(lekkiPrincipal).post(`/leave/${far.id}/approve`).expect(404);
    await api(lekkiPrincipal)
      .post(`/leave/${far.id}/decline`)
      .send({ reason: 'No' })
      .expect(404);

    const approved = (
      await api(lekkiPrincipal).post(`/leave/${near.id}/approve`).expect(200)
    ).body as LeaveDto;
    expect(approved).toMatchObject({
      status: 'approved',
      approvedBy: lekkiPrincipal.id,
      deciderName: 'Test User',
      days: 2,
    });
    await api(lekkiPrincipal)
      .post(`/leave/${nearTwo.id}/decline`)
      .send({ reason: '   ' })
      .expect(400);
    const declined = (
      await api(lekkiPrincipal)
        .post(`/leave/${nearTwo.id}/decline`)
        .send({ reason: 'Exams that week' })
        .expect(200)
    ).body as LeaveDto;
    expect(declined).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Exams that week',
      rejectedBy: lekkiPrincipal.id,
    });

    const mine = await mineOf(api, emeka);
    expect(mine.daysTakenThisYear).toBe(2);
    expect(mine.items.map((item) => item.status).toSorted(byText)).toEqual([
      'approved',
      'rejected',
    ]);
    expect(await queueOf(api, lekkiPrincipal)).toEqual([]);
  });

  test('lists one member with every status for the member page', async ({
    api,
    schools: { owner, lekkiOnly, noPermission },
  }) => {
    const done = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    await approveLeave(api, owner, done.id);
    await askLeave(api, lekkiOnly, { startsOn: '2026-10-29' });
    await askLeave(api, noPermission, { startsOn: '2026-10-22' });

    const all = await queueOf(api, owner, `?status=all&userId=${lekkiOnly.id}`);
    expect(all.map((item) => item.status).toSorted(byText)).toEqual([
      'approved',
      'submitted',
    ]);
    expect(await queueOf(api, owner)).toHaveLength(2);
  });

  test('answers 409 SelfApproval for a requester outside their own campus scope', async ({
    api,
    withPermissions,
    schools: { orgA },
  }) => {
    const grace = await withPermissions(orgA, ['leave:approve']);
    const mine = await askLeave(api, grace, { startsOn: '2026-10-22' });

    const approve = await api(grace)
      .post(`/leave/${mine.id}/approve`)
      .expect(409);
    expect(approve.body).toMatchObject({ code: 'SelfApproval' });
  });

  test('never lets a requester decide their own request, in the service or the database', async ({
    api,
    pool,
    withPermissions,
    schools: { orgA, lekki },
  }) => {
    const grace = await withPermissions(orgA, ['leave:approve'], {
      campuses: [lekki],
    });
    const mine = await askLeave(api, grace, { startsOn: '2026-10-22' });

    const approve = await api(grace)
      .post(`/leave/${mine.id}/approve`)
      .expect(409);
    const decline = await api(grace)
      .post(`/leave/${mine.id}/decline`)
      .send({ reason: 'Nope' })
      .expect(409);

    expect(approve.body).toMatchObject({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(decline.body.code).toBe('SelfApproval');
    expect((await queueOf(api, grace))[0]).toMatchObject({
      id: mine.id,
      isOwn: true,
    });
    await expect(
      pool.query(
        `UPDATE staff_leave SET status = 'approved', approved_by = created_by, approved_at = now() WHERE id = $1`,
        [mine.id]
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'staff_leave_approved_not_self',
    });
    await expect(
      pool.query(
        `UPDATE staff_leave SET status = 'rejected', rejected_by = created_by, rejected_at = now(),
           rejection_reason = 'No' WHERE id = $1`,
        [mine.id]
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'staff_leave_rejected_not_self',
    });
  });

  test('gives one winner when two approvers decide at once', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly },
  }) => {
    const second = await withPermissions(orgA, ['leave:approve'], {
      campuses: [lekki],
    });
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    const results = await Promise.all(
      [owner, second].map((approver) =>
        api(approver).post(`/leave/${leave.id}/approve`)
      )
    );

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(results.find((res) => res.status === 409)?.body).toMatchObject({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
  });

  test('refuses to change a decided request in the database', async ({
    api,
    pool,
    schools: { owner, lekkiOnly },
  }) => {
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    await approveLeave(api, owner, leave.id);

    await expect(
      pool.query(`UPDATE staff_leave SET reason = 'Edited' WHERE id = $1`, [
        leave.id,
      ])
    ).rejects.toMatchObject({ constraint: 'staff_leave_decided_frozen' });
    await expect(
      pool.query(`DELETE FROM staff_leave WHERE id = $1`, [leave.id])
    ).rejects.toMatchObject({ constraint: 'staff_leave_never_deleted' });
  });

  test('lets the owner be the only approver, and says so until someone else can', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki },
  }) => {
    const mine = await askLeave(api, owner, { startsOn: '2026-10-22' });
    expect(mine.status).toBe('submitted');
    expect((await mineOf(api, owner)).otherApproverExists).toBe(false);

    await withPermissions(orgA, ['leave:approve'], { campuses: [lekki] });
    expect((await mineOf(api, owner)).otherApproverExists).toBe(true);
  });

  test('keeps the bursar out of every approver route', async ({
    api,
    schools: { owner, lekkiOnly },
  }) => {
    const leave = await askLeave(api, owner, { startsOn: '2026-10-22' });
    await api(lekkiOnly).get('/leave').expect(403);
    await api(lekkiOnly).post(`/leave/${leave.id}/approve`).expect(403);
    await api(lekkiOnly)
      .post(`/leave/${leave.id}/decline`)
      .send({ reason: 'No' })
      .expect(403);
  });
});

test.describe('who may approve', () => {
  test('the Principal starter role holds leave:approve after sync and an edited one is left alone', async ({
    api,
    pool,
    schools: { orgA, orgB, owner, ownerB },
  }) => {
    const principal = STARTER_ROLES.find((role) => role.slug === 'principal');
    const old = JSON.stringify(
      toPermissionMap(
        (principal?.permissions ?? []).filter(
          (permission) => permission !== 'leave:approve'
        )
      )
    );
    await pool.query(
      `UPDATE "organizationRole" SET permission = $2, "editedAt" = NULL
       WHERE "organizationId" = $1 AND role = 'principal'`,
      [orgA.id, old]
    );
    await pool.query(
      `UPDATE "organizationRole" SET permission = $2, "editedAt" = now()
       WHERE "organizationId" = $1 AND role = 'principal'`,
      [orgB.id, old]
    );

    await syncAllStarterRoles(pool);

    expect((await roleOf(api, owner, 'principal')).permissions.leave).toEqual([
      'approve',
    ]);
    expect(
      (await roleOf(api, ownerB, 'principal')).permissions.leave
    ).toBeUndefined();
  });
});

test.describe('removing a member', () => {
  test('keeps their leave and the names on it', async ({
    api,
    addMember,
    createUser,
    schools: { owner, orgA, lekki },
  }) => {
    const ayo = await addMember(
      orgA,
      await createUser({ name: 'Ayo Bassey' }),
      {
        roles: ['teacher'],
        campuses: [lekki],
      }
    );
    const leave = await askLeave(api, ayo, { startsOn: '2026-10-22' });
    await approveLeave(api, owner, leave.id);
    const members = (await api(owner).get('/members?q=').expect(200))
      .body as MemberList;
    const memberId = members.items.find((item) => item.userId === ayo.id)?.id;

    await api(owner).delete(`/members/${memberId}`).expect(200);

    const kept = await queueOf(api, owner, `?status=all&userId=${ayo.id}`);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      requesterName: 'Ayo Bassey',
      status: 'approved',
      approvedBy: owner.id,
      deciderName: 'Test User',
    });
  });
});

test.describe('isolation', () => {
  test('case 1: another school’s ids answer 404 on every write', async ({
    api,
    schools: { owner, lekkiOnly, ownerB },
  }) => {
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    await api(ownerB).post(`/leave/${leave.id}/approve`).expect(404);
    await api(ownerB)
      .post(`/leave/${leave.id}/decline`)
      .send({ reason: 'No' })
      .expect(404);
    await api(ownerB).post(`/leave/${leave.id}/withdraw`).expect(404);
    expect(await queueOf(api, owner, '?status=all')).toMatchObject([
      { id: leave.id, status: 'submitted' },
    ]);
  });

  test('case 2: another school’s rows never leak into a list, queue or approvals', async ({
    api,
    schools: { owner, lekkiOnly, ownerB },
  }) => {
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    expect(await queueOf(api, ownerB, '?status=all')).toEqual([]);
    expect(
      await queueOf(api, ownerB, `?status=all&userId=${lekkiOnly.id}`)
    ).toEqual([]);
    expect((await mineOf(api, ownerB)).items).toEqual([]);
    const approvals = (await api(ownerB).get('/approvals').expect(200))
      .body as ApprovalList;
    expect(approvals.items.map((item) => item.id)).not.toContain(leave.id);
    expect(
      (await queueOf(api, owner, '?status=all')).map((item) => item.id)
    ).toEqual([leave.id]);
  });

  test('case 5: a member without the permission answers 403', async ({
    api,
    schools: { lekkiOnly, noPermission },
  }) => {
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    await api(noPermission).get('/leave').expect(403);
    await api(noPermission).post(`/leave/${leave.id}/approve`).expect(403);
  });

  test('case 6: no session answers 401', async ({
    api,
    schools: { lekkiOnly },
  }) => {
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    const body = { type: 'annual', startsOn: '2026-10-22', reason: 'Trip' };
    await api().get('/me/leave').expect(401);
    await api().post('/leave').send(body).expect(401);
    await api().get('/leave').expect(401);
    await api().post(`/leave/${leave.id}/withdraw`).expect(401);
    await api().post(`/leave/${leave.id}/approve`).expect(401);
    await api()
      .post(`/leave/${leave.id}/decline`)
      .send({ reason: 'No' })
      .expect(401);
  });

  test('case 12: an acting super admin cannot write leave, with or without a reason, and is audited', async ({
    api,
    pool,
    makeSuperAdmin,
    createUser,
    schools: { orgA, owner, lekkiOnly },
  }) => {
    const leave = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    const admin = await makeSuperAdmin(await createUser());
    const body = { type: 'annual', startsOn: '2026-10-22', reason: 'Trip' };
    const create = (headers: Record<string, string>) =>
      api(admin).post('/leave').set(headers).send(body);
    const withdraw = (headers: Record<string, string>) =>
      api(admin).post(`/leave/${leave.id}/withdraw`).set(headers);
    const approve = (headers: Record<string, string>) =>
      api(admin).post(`/leave/${leave.id}/approve`).set(headers);
    const decline = (headers: Record<string, string>) =>
      api(admin)
        .post(`/leave/${leave.id}/decline`)
        .set(headers)
        .send({ reason: 'No' });

    for (const write of [create, withdraw, approve, decline]) {
      const refused = await write(acting(orgA.id)).expect(403);
      expect(refused.body).toMatchObject({ code: 'ActingReadOnly' });
    }
    const rows = await waitForAuditRows(
      pool,
      { organizationId: orgA.id, kind: 'acting' },
      4
    );
    expect(rows.map((row) => [row.method, row.path, row.status])).toEqual([
      ['POST', '/leave', 403],
      ['POST', `/leave/${leave.id}/withdraw`, 403],
      ['POST', `/leave/${leave.id}/approve`, 403],
      ['POST', `/leave/${leave.id}/decline`, 403],
    ]);

    for (const write of [create, withdraw]) {
      const refused = await write(acting(orgA.id, 'SUP-1 check leave')).expect(
        403
      );
      expect(refused.body.message).toBe(LEAVE_STAFF_ONLY_MESSAGE);
    }
    expect(await queueOf(api, owner, '?status=all')).toMatchObject([
      { id: leave.id, status: 'submitted' },
    ]);
  });
});
