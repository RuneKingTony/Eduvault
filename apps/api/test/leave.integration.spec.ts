import {
  ALREADY_DECIDED_MESSAGE,
  LEAVE_CANCEL_NOT_APPROVED_MESSAGE,
  LEAVE_CANCEL_STARTED_MESSAGE,
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
import {
  approvedLeave,
  approveLeave,
  askLeave,
  cancelLeave,
  markLeaveSeen,
} from './support/factories/leave';
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

  test('lets the owner approve their own leave and the audit row says so', async ({
    api,
    pool,
    schools: { owner },
  }) => {
    const mine = await askLeave(api, owner, { startsOn: '2026-10-22' });

    await approveLeave(api, owner, mine.id);

    const { rows } = await pool.query<{ text: string }>(
      `SELECT text FROM activity_event WHERE kind = 'leave.approved' AND subject_id = $1`,
      [mine.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toMatch(/\(their own request\)\.$/);
  });

  test('never lets a requester decide their own request', async ({
    api,
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

test.describe('cancelling approved leave', () => {
  test('an approver cancels leave that has not started, frees the days and the requester can ask again', async ({
    api,
    pool,
    schools: { owner, lekkiOnly },
  }) => {
    const leave = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-10-22',
      }
    );
    const before = await mineOf(api, lekkiOnly);
    expect(before.daysTakenThisYear).toBe(1);
    expect(before.nextTimeOff?.id).toBe(leave.id);

    const res = await api(owner)
      .post(`/leave/${leave.id}/cancel`)
      .send({ reason: '  Cover is short  ' })
      .expect(200);

    expect(res.body).toMatchObject({
      id: leave.id,
      status: 'cancelled',
      cancelledBy: owner.id,
      cancellerName: 'Test User',
      cancellationReason: 'Cover is short',
      approvedBy: owner.id,
    });
    expect((res.body as LeaveDto).cancelledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const after = await mineOf(api, lekkiOnly);
    expect(after).toMatchObject({ daysTakenThisYear: 0, nextTimeOff: null });
    expect(after.items[0]).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'Cover is short',
    });
    await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });

    const { rows } = await pool.query<{ kind: string; text: string }>(
      `SELECT kind, text FROM activity_event WHERE subject_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [leave.id]
    );
    expect(rows[0]?.kind).toBe('leave.cancelled');
    expect(rows[0]?.text).toMatch(
      /’s annual leave \(22 Oct 2026\) was cancelled\.$/
    );
  });

  test('answers 409 once the first day has come', async ({
    api,
    clock,
    schools: { owner, lekkiOnly },
  }) => {
    const leave = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-10-22',
      }
    );

    for (const today of ['2026-10-22', '2026-10-25']) {
      clock.set(today);
      const res = await api(owner)
        .post(`/leave/${leave.id}/cancel`)
        .send({ reason: 'Too late' })
        .expect(409);
      expect(res.body.message).toBe(LEAVE_CANCEL_STARTED_MESSAGE);
    }
    expect((await mineOf(api, lekkiOnly)).items[0]?.status).toBe('approved');
  });

  test('answers 409 for waiting, declined, withdrawn and already cancelled leave', async ({
    api,
    schools: { owner, lekkiOnly },
  }) => {
    const waiting = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    const declined = await askLeave(api, lekkiOnly, { startsOn: '2026-10-29' });
    await api(owner)
      .post(`/leave/${declined.id}/decline`)
      .send({ reason: 'Exams that week' })
      .expect(200);
    const withdrawn = await askLeave(api, lekkiOnly, {
      startsOn: '2026-11-05',
    });
    await api(lekkiOnly).post(`/leave/${withdrawn.id}/withdraw`).expect(200);
    const cancelled = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-11-12',
      }
    );
    await cancelLeave(api, owner, cancelled.id);

    for (const { id } of [waiting, declined, withdrawn, cancelled]) {
      const res = await api(owner)
        .post(`/leave/${id}/cancel`)
        .send({ reason: 'Cover is short' })
        .expect(409);
      expect(res.body.message).toBe(LEAVE_CANCEL_NOT_APPROVED_MESSAGE);
    }
  });

  test('asks for a reason of 1 to 500 characters', async ({
    api,
    schools: { owner, lekkiOnly },
  }) => {
    const leave = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-10-22',
      }
    );

    for (const body of [{}, { reason: '   ' }, { reason: 'x'.repeat(501) }]) {
      await api(owner).post(`/leave/${leave.id}/cancel`).send(body).expect(400);
    }
    expect((await mineOf(api, lekkiOnly)).items[0]?.status).toBe('approved');
    await api(owner)
      .post(`/leave/${leave.id}/cancel`)
      .send({ reason: 'x'.repeat(500) })
      .expect(200);
  });

  test('never lets an approver cancel their own leave', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki },
  }) => {
    const grace = await withPermissions(orgA, ['leave:approve'], {
      campuses: [lekki],
    });
    const mine = await approvedLeave(
      api,
      { requester: grace, approver: owner },
      {
        startsOn: '2026-10-22',
      }
    );

    const res = await api(grace)
      .post(`/leave/${mine.id}/cancel`)
      .send({ reason: 'Changed my mind' })
      .expect(409);
    expect(res.body).toMatchObject({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect((await mineOf(api, grace)).items[0]?.status).toBe('approved');
  });

  test('needs leave:approve, and answers 404 outside the campus scope or in another school', async ({
    api,
    withPermissions,
    schools: { owner, ownerB, orgA, lekki, ikeja, lekkiOnly, noPermission },
  }) => {
    const lekkiApprover = await withPermissions(orgA, ['leave:approve'], {
      campuses: [lekki],
    });
    const inLekki = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-10-22',
      }
    );
    const ikejaMember = await withPermissions(orgA, [], { campuses: [ikeja] });
    const inIkeja = await approvedLeave(
      api,
      { requester: ikejaMember, approver: owner },
      {
        startsOn: '2026-10-22',
      }
    );
    const body = { reason: 'Cover is short' };

    await api(noPermission)
      .post(`/leave/${inLekki.id}/cancel`)
      .send(body)
      .expect(403);
    await api(lekkiOnly)
      .post(`/leave/${inLekki.id}/cancel`)
      .send(body)
      .expect(403);
    await api(lekkiApprover)
      .post(`/leave/${inIkeja.id}/cancel`)
      .send(body)
      .expect(404);
    await api(ownerB)
      .post(`/leave/${inLekki.id}/cancel`)
      .send(body)
      .expect(404);
    await api(owner)
      .post('/leave/00000000-0000-4000-8000-000000000000/cancel')
      .send(body)
      .expect(404);

    await cancelLeave(api, lekkiApprover, inLekki.id);
  });

  test('gives one winner when two approvers cancel at once', async ({
    api,
    withPermissions,
    schools: { owner, orgA, lekki, lekkiOnly },
  }) => {
    const second = await withPermissions(orgA, ['leave:approve'], {
      campuses: [lekki],
    });
    const leave = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-10-22',
      }
    );

    const results = await Promise.all(
      [owner, second].map((approver) =>
        api(approver).post(`/leave/${leave.id}/cancel`).send({ reason: 'Race' })
      )
    );

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ]);
  });

  test('keeps the trigger shut on every other change to a decided row', async ({
    api,
    pool,
    schools: { owner, lekkiOnly },
  }) => {
    const approved = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-10-22',
      }
    );
    const cancelled = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-10-29',
      }
    );
    await cancelLeave(api, owner, cancelled.id);
    const frozen = { constraint: 'staff_leave_decided_frozen' };

    for (const statement of [
      `UPDATE staff_leave SET status = 'submitted' WHERE id = $1`,
      `UPDATE staff_leave SET starts_on = '2026-10-23', ends_on = '2026-10-23' WHERE id = $1`,
      `UPDATE staff_leave SET reason = 'Edited' WHERE id = $1`,
      `UPDATE staff_leave SET status = 'cancelled', cancelled_by = approved_by, cancelled_at = now(),
         cancellation_reason = 'Sneaky', reason = 'Edited' WHERE id = $1`,
    ]) {
      await expect(pool.query(statement, [approved.id])).rejects.toMatchObject(
        frozen
      );
    }
    await expect(
      pool.query(`UPDATE staff_leave SET status = 'approved' WHERE id = $1`, [
        cancelled.id,
      ])
    ).rejects.toMatchObject(frozen);
    for (const { id } of [approved, cancelled]) {
      await expect(
        pool.query(`DELETE FROM staff_leave WHERE id = $1`, [id])
      ).rejects.toMatchObject({ constraint: 'staff_leave_never_deleted' });
    }
  });
});

test.describe('unseen leave decisions', () => {
  test('lists approved, declined and cancelled leave newest first, never a withdrawal, until Got it', async ({
    api,
    schools: { owner, lekkiOnly },
  }) => {
    const approved = await askLeave(api, lekkiOnly, { startsOn: '2026-10-22' });
    const declined = await askLeave(api, lekkiOnly, { startsOn: '2026-10-29' });
    const cancelled = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      {
        startsOn: '2026-11-05',
      }
    );
    const withdrawn = await askLeave(api, lekkiOnly, {
      startsOn: '2026-11-12',
    });
    expect((await mineOf(api, lekkiOnly)).unseenCount).toBe(1);

    await approveLeave(api, owner, approved.id);
    await api(owner)
      .post(`/leave/${declined.id}/decline`)
      .send({ reason: 'Exams that week' })
      .expect(200);
    await cancelLeave(api, owner, cancelled.id);
    await api(lekkiOnly).post(`/leave/${withdrawn.id}/withdraw`).expect(200);

    const mine = await mineOf(api, lekkiOnly);
    expect(mine.unseenCount).toBe(3);
    expect(mine.unseenDecisions.map(({ id, status }) => [id, status])).toEqual([
      [cancelled.id, 'cancelled'],
      [declined.id, 'rejected'],
      [approved.id, 'approved'],
    ]);
    expect(mine.unseenDecisions[0]).toMatchObject({
      cancellerName: 'Test User',
      cancellationReason: 'Cover is short',
    });

    const seen = await markLeaveSeen(api, lekkiOnly).expect(200);
    expect((seen.body as { seenAt: string }).seenAt).toMatch(/^\d{4}-/);
    expect(await mineOf(api, lekkiOnly)).toMatchObject({
      unseenCount: 0,
      unseenDecisions: [],
    });

    const later = await askLeave(api, lekkiOnly, { startsOn: '2026-11-19' });
    await approveLeave(api, owner, later.id);
    const again = await mineOf(api, lekkiOnly);
    expect(again.unseenCount).toBe(1);
    expect(again.unseenDecisions[0]?.id).toBe(later.id);
  });

  test('a decision made at the very moment of the marker counts as seen', async ({
    api,
    pool,
    schools: { owner, lekkiOnly },
  }) => {
    const leave = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      { startsOn: '2026-10-22' }
    );
    const mark = (offsetMs: number) =>
      pool.query(
        `INSERT INTO staff_leave_seen (organization_id, user_id, seen_at)
         SELECT organization_id, created_by,
                approved_at + make_interval(secs => $2 / 1000.0)
         FROM staff_leave WHERE id = $1
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET seen_at = EXCLUDED.seen_at`,
        [leave.id, offsetMs]
      );

    await mark(-1);
    expect((await mineOf(api, lekkiOnly)).unseenCount).toBe(1);
    await mark(0);
    expect((await mineOf(api, lekkiOnly)).unseenCount).toBe(0);
  });

  test('Got it only clears what was shown: a later decision and a future time do not hide anything', async ({
    api,
    schools: { owner, lekkiOnly },
  }) => {
    const first = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      { startsOn: '2026-10-22' }
    );
    const shownAt = first.approvedAt ?? '';
    const second = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      { startsOn: '2026-10-29' }
    );

    await markLeaveSeen(api, lekkiOnly, shownAt).expect(200);
    expect(await mineOf(api, lekkiOnly)).toMatchObject({
      unseenCount: 1,
      unseenDecisions: [{ id: second.id }],
    });

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await markLeaveSeen(api, lekkiOnly, tomorrow).expect(200);
    const third = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      { startsOn: '2026-11-05' }
    );
    expect(await mineOf(api, lekkiOnly)).toMatchObject({
      unseenCount: 1,
      unseenDecisions: [{ id: third.id }],
    });

    await markLeaveSeen(api, lekkiOnly, shownAt).expect(200);
    expect((await mineOf(api, lekkiOnly)).unseenCount).toBe(1);
  });

  test('refuses a seen marker with no time', async ({
    api,
    schools: { lekkiOnly },
  }) => {
    await api(lekkiOnly).post('/me/leave/seen').send({}).expect(400);
  });

  test('shows at most five decisions and counts them all', async ({
    api,
    schools: { owner, lekkiOnly },
  }) => {
    for (const startsOn of [
      '2026-10-22',
      '2026-10-29',
      '2026-11-05',
      '2026-11-12',
      '2026-11-19',
      '2026-11-26',
    ]) {
      await approvedLeave(
        api,
        { requester: lekkiOnly, approver: owner },
        { startsOn }
      );
    }
    const mine = await mineOf(api, lekkiOnly);
    expect(mine.unseenDecisions).toHaveLength(5);
    expect(mine.unseenCount).toBe(6);
  });

  test('keeps each member’s marker apart', async ({
    api,
    schools: { owner, lekkiOnly, noPermission },
  }) => {
    await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      { startsOn: '2026-10-22' }
    );
    await approvedLeave(
      api,
      { requester: noPermission, approver: owner },
      { startsOn: '2026-10-22' }
    );
    await markLeaveSeen(api, lekkiOnly).expect(200);

    expect((await mineOf(api, lekkiOnly)).unseenCount).toBe(0);
    expect((await mineOf(api, noPermission)).unseenCount).toBe(1);
  });

  test('keeps a member of two schools’ decisions and seen marker apart', async ({
    api,
    addMember,
    createUser,
    setActiveOrganization,
    schools: { orgA, orgB, owner, ownerB, lekki, campusB },
  }) => {
    const traveller = await createUser();
    await addMember(orgB, traveller, {
      roles: ['bursar'],
      campuses: [campusB],
    });
    await addMember(orgA, traveller, { roles: ['bursar'], campuses: [lekki] });

    await setActiveOrganization(traveller, orgA.id);
    const inA = await approvedLeave(
      api,
      { requester: traveller, approver: owner },
      { startsOn: '2026-10-22' }
    );
    await setActiveOrganization(traveller, orgB.id);
    const inB = await approvedLeave(
      api,
      { requester: traveller, approver: ownerB },
      { startsOn: '2026-11-05' }
    );

    expect(await mineOf(api, traveller)).toMatchObject({
      unseenCount: 1,
      unseenDecisions: [{ id: inB.id }],
    });
    await setActiveOrganization(traveller, orgA.id);
    expect(await mineOf(api, traveller)).toMatchObject({
      unseenCount: 1,
      unseenDecisions: [{ id: inA.id }],
    });

    await markLeaveSeen(api, traveller).expect(200);
    expect(await mineOf(api, traveller)).toMatchObject({
      unseenCount: 0,
      unseenDecisions: [],
    });
    await setActiveOrganization(traveller, orgB.id);
    expect(await mineOf(api, traveller)).toMatchObject({
      unseenCount: 1,
      unseenDecisions: [{ id: inB.id }],
    });
  });

  test('is for staff: families get 403 and an acting super admin is refused', async ({
    api,
    app,
    makeSuperAdmin,
    createUser,
    schools: { orgA, owner, lekki, ikeja },
  }) => {
    const { ada } = await family(app, { owner, lekki, ikeja });
    for (const portal of [
      await signInAs(api, studentOf(ada.logins)),
      await signInAs(api, guardianOf(ada.logins)),
    ]) {
      await api(portal)
        .post('/me/leave/seen')
        .send({ through: new Date().toISOString() })
        .expect(403);
    }

    const admin = await makeSuperAdmin(await createUser());
    const refused = await markLeaveSeen(api, admin)
      .set(acting(orgA.id, 'SUP-1 check leave'))
      .expect(403);
    expect(refused.body.message).toBe(LEAVE_STAFF_ONLY_MESSAGE);
    await api()
      .post('/me/leave/seen')
      .send({ through: new Date().toISOString() })
      .expect(401);
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
    await api(ownerB)
      .post(`/leave/${leave.id}/cancel`)
      .send({ reason: 'No' })
      .expect(404);
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
      .post(`/leave/${leave.id}/cancel`)
      .send({ reason: 'No' })
      .expect(401);
    await api()
      .post(`/leave/${leave.id}/decline`)
      .send({ reason: 'No' })
      .expect(401);
  });

  test('an acting super admin with a reason cancels approved leave like an approver', async ({
    api,
    makeSuperAdmin,
    createUser,
    schools: { orgA, owner, lekkiOnly },
  }) => {
    const leave = await approvedLeave(
      api,
      { requester: lekkiOnly, approver: owner },
      { startsOn: '2026-10-22' }
    );
    const admin = await makeSuperAdmin(await createUser());

    const res = await api(admin)
      .post(`/leave/${leave.id}/cancel`)
      .set(acting(orgA.id, 'SUP-1 check leave'))
      .send({ reason: 'Cover is short' })
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'cancelled',
      cancelledBy: admin.id,
      cancellationReason: 'Cover is short',
    });
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
    const cancel = (headers: Record<string, string>) =>
      api(admin)
        .post(`/leave/${leave.id}/cancel`)
        .set(headers)
        .send({ reason: 'No' });

    for (const write of [create, withdraw, approve, decline, cancel]) {
      const refused = await write(acting(orgA.id)).expect(403);
      expect(refused.body).toMatchObject({ code: 'ActingReadOnly' });
    }
    const rows = await waitForAuditRows(
      pool,
      { organizationId: orgA.id, kind: 'acting' },
      5
    );
    expect(rows.map((row) => [row.method, row.path, row.status])).toEqual([
      ['POST', '/leave', 403],
      ['POST', `/leave/${leave.id}/withdraw`, 403],
      ['POST', `/leave/${leave.id}/approve`, 403],
      ['POST', `/leave/${leave.id}/decline`, 403],
      ['POST', `/leave/${leave.id}/cancel`, 403],
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
