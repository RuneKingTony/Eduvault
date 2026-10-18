import {
  FEE_TYPE_NOT_FOUND_MESSAGE,
  INVOICE_NO_TERM_MESSAGE,
  INVOICE_REFERENCE_TAKEN_MESSAGE,
  INVOICE_STUDENT_NOT_FOUND_MESSAGE,
  INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE,
  invoiceReferenceUsedMessage,
  oneOffChargeReference,
  type CreatedCharge,
  type CreateOneOffCharge,
  type FeeType,
  type Invoice,
} from '@eduvault/api-contract';
import type { Pool, PoolClient } from 'pg';
import { chargeRequestHash } from '../src/app/common/fees';
import {
  acting,
  expect,
  type Fixtures,
  type TestUser,
} from './support/base-test';
import {
  chargeFixture,
  entriesFor,
  invoicesOf,
  prepare,
  receivableBalance,
  sendRun,
} from './support/factories/billing';
import { createClass } from './support/factories/classes';
import { financeActivityRows } from './support/factories/finance';
import { schoolsTest as test } from './support/two-schools';

type Api = Fixtures['api'];

const TRIP = 1_500_000;
const CARD = 250_000;
const TOTAL = TRIP + CARD;

let sequence = 0;
const freshReference = (): string => {
  sequence += 1;
  return oneOffChargeReference(
    '2026-10-07',
    `${String(sequence).padStart(8, '0')}-0000-4000-8000-000000000000`
  );
};

async function feeTypes(
  api: Api,
  actor: TestUser
): Promise<{ tuition: string; bus: string }> {
  const types = (await api(actor).get('/fee-types').expect(200))
    .body as FeeType[];
  const idOf = (name: string) =>
    types.find((type) => type.name === name)?.id ?? '';
  return { tuition: idOf('Tuition'), bus: idOf('School bus') };
}

const chargeBody = (
  studentId: string,
  fees: { tuition: string; bus: string },
  over: Partial<CreateOneOffCharge> = {}
): CreateOneOffCharge => ({
  studentId,
  reference: freshReference(),
  lines: [
    { feeTypeId: fees.tuition, description: 'School trip', amountMinor: TRIP },
    { feeTypeId: fees.bus, description: 'ID card', amountMinor: CARD },
  ],
  ...over,
});

const post = (api: Api, actor: TestUser, body: CreateOneOffCharge) =>
  api(actor).post('/invoices').send(body);

const added = async (
  api: Api,
  actor: TestUser,
  body: CreateOneOffCharge
): Promise<CreatedCharge> =>
  (await post(api, actor, body).expect(201)).body as CreatedCharge;

async function adhocTables(
  pool: Pool
): Promise<{ invoices: number; entries: number }> {
  const { rows } = await pool.query<{ invoices: number; entries: number }>(
    `SELECT
       (SELECT count(*) FROM invoice WHERE kind = 'adhoc')::int AS invoices,
       (SELECT count(*) FROM journal_entry WHERE kind = 'adhoc')::int AS entries`
  );
  return rows[0] ?? { invoices: 0, entries: 0 };
}

async function placeAt(
  pool: Pool,
  student: { organizationId: string; id: string },
  arm: { id: string; campusId: string }
): Promise<void> {
  await pool.query(
    `UPDATE enrollment_placement p
     SET class_arm_id = $3, campus_id = $4
     FROM student_enrollment e, term t
     WHERE e.id = p.enrollment_id AND e.student_id = $2
       AND t.id = p.term_id AND t.is_current
       AND p.organization_id = $1`,
    [student.organizationId, student.id, arm.id, arm.campusId]
  );
}

interface Meanwhile {
  api: Api;
  pool: Pool;
  owner: TestUser;
  orgId: string;
  fees: { tuition: string; bus: string };
  student: { id: string; admittedOn: string };
}

async function currentTermId(pool: Pool, organizationId: string) {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM term WHERE organization_id = $1 AND is_current',
    [organizationId]
  );
  return rows[0]?.id ?? '';
}

async function whileLockedOut<T>(
  pool: Pool,
  lock: { organizationId: string; reference: string },
  steps: {
    send: () => PromiseLike<T>;
    meanwhile: (held: PoolClient) => Promise<void>;
  }
): Promise<T> {
  const held = await pool.connect();
  try {
    await held.query('BEGIN');
    await held.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `invoice-charge:${lock.organizationId}:${lock.reference}`,
    ]);
    const pending = steps.send();
    await expect
      .poll(
        async () => {
          const { rows } = await pool.query<{ waiting: number }>(
            `SELECT count(*)::int AS waiting FROM pg_locks
           WHERE locktype = 'advisory' AND NOT granted
             AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`
          );
          return rows[0]?.waiting;
        },
        { timeout: 10_000 }
      )
      .toBe(1);
    await steps.meanwhile(held);
    await held.query('COMMIT');
    return await pending;
  } finally {
    await held.query('ROLLBACK');
    held.release();
  }
}

test.beforeEach(({ clock }) => {
  clock.set('2026-10-07');
});

test.describe('adding a one-off charge', () => {
  test('the bursar sends a charge at once, on the current term and the student’s campus', async ({
    api,
    schools: { lekkiOnly, lekki, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const body = chargeBody(studentLekki.id, fees);

    const res = await post(api, lekkiOnly, body).expect(201);
    const charge = res.body as CreatedCharge;

    expect(charge).toMatchObject({
      kind: 'adhoc',
      status: 'issued',
      replayed: false,
      campusId: lekki.id,
      totalMinor: TOTAL,
      student: { id: studentLekki.id },
    });
    expect(charge.number).toMatch(/^CHG-2026-\d{5}$/);
    expect(charge.issuedAt).not.toBeNull();
    expect(charge.billingRun).toBeNull();
    const current = (await api(lekkiOnly).get('/calendar/current').expect(200))
      .body as { term: { id: string } | null };
    expect(charge.termId).toBe(current.term?.id);
  });

  test('numbers it from the sequence term charges use', async ({
    api,
    app,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.firstTermId,
      scope: 'school',
    });
    const sent = await sendRun(api, owner, runId ?? '');
    const fees = await feeTypes(api, lekkiOnly);

    const first = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    );
    const second = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    );

    const taken = sent.charges.map((row) => row.number);
    expect(taken).toHaveLength(2);
    expect(first.number).toBe('CHG-2026-00003');
    expect(second.number).toBe('CHG-2026-00004');
  });

  test('lists as One-off with its lines in For, and counts it', async ({
    api,
    schools: { lekkiOnly, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const charge = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    );

    const list = await invoicesOf(api, lekkiOnly);
    const adhoc = await invoicesOf(api, lekkiOnly, '?kind=adhoc');

    expect(list.counts).toEqual({ term: 0, adhoc: 1, store: 0 });
    expect(adhoc.items).toHaveLength(1);
    expect(adhoc.items[0]).toMatchObject({
      id: charge.id,
      number: charge.number,
      kind: 'adhoc',
      status: 'issued',
      totalMinor: TOTAL,
      feeCount: 0,
    });
    expect(adhoc.items[0]?.forText).toContain('School trip');
    expect(adhoc.items[0]?.forText).toContain('ID card');
  });

  test('shows the lines and a balanced journal: Dr Fees owed with the student, Cr each fee type, on the charge’s campus', async ({
    api,
    pool,
    schools: { lekkiOnly, orgA, lekki, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const created = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    );

    const detail = (
      await api(lekkiOnly).get(`/invoices/${created.id}`).expect(200)
    ).body as Invoice;

    expect(
      detail.lines.map((line) => [line.description, line.amountMinor])
    ).toEqual([
      ['School trip', TRIP],
      ['ID card', CARD],
    ]);
    expect(detail.lines.every((line) => line.feeLineId === null)).toBe(true);
    expect(detail.journal).toMatchObject({
      reference: created.number,
      balanced: true,
    });
    expect(
      detail.journal?.lines.map((line) => [
        line.accountCode,
        line.studentName === null ? null : 'student',
        line.campusName,
        line.debitMinor,
        line.creditMinor,
      ])
    ).toEqual([
      [1100, 'student', 'Lekki', TRIP, 0],
      [1100, 'student', 'Lekki', CARD, 0],
      [4010, null, 'Lekki', 0, TRIP],
      [4030, null, 'Lekki', 0, CARD],
    ]);
    const entries = await entriesFor(pool, orgA.id, created.number ?? '');
    expect(entries.every((row) => row.campus_id === lekki.id)).toBe(true);
    const { rows } = await pool.query<{ kind: string; memo: string }>(
      `SELECT kind, memo FROM journal_entry WHERE organization_id = $1 AND reference = $2`,
      [orgA.id, created.number]
    );
    expect(rows).toEqual([
      {
        kind: 'adhoc',
        memo: `Charge · ${detail.student.name}`,
      },
    ]);
  });

  test('raises the student’s balance and the next charge’s brought forward by the total', async ({
    api,
    pool,
    schools: { lekkiOnly, orgA, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const first = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    );
    const second = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    );

    expect(first).toMatchObject({
      broughtForwardMinor: 0,
      dueAtIssueMinor: TOTAL,
    });
    expect(second).toMatchObject({
      broughtForwardMinor: TOTAL,
      dueAtIssueMinor: 2 * TOTAL,
      balanceTodayMinor: 2 * TOTAL,
    });
    expect(await receivableBalance(pool, orgA.id, studentLekki.id)).toBe(
      2 * TOTAL
    );
  });

  test('writes one finance activity row on the student’s campus', async ({
    api,
    pool,
    schools: { lekkiOnly, orgA, lekki, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const created = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    );

    const rows = await financeActivityRows(pool, orgA.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'charge.adhoc',
      campus_id: lekki.id,
      subject_type: 'invoice',
      subject_id: created.id,
    });
    expect(rows[0]?.text).toBe(
      `Charged ${created.student.name} ₦17,500 (${created.number})`
    );
  });
});

test.describe('a student placed away from the home campus', () => {
  test('is charged on the campus of the current term’s placement', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentIkeja },
  }) => {
    const fees = await feeTypes(api, owner);
    const lekkiArm = await createClass(app, owner, { campusId: lekki.id });
    await placeAt(
      pool,
      { organizationId: orgA.id, id: studentIkeja.id },
      { id: lekkiArm.id, campusId: lekki.id }
    );

    const charge = await added(api, owner, chargeBody(studentIkeja.id, fees));

    expect(charge.campusId).toBe(lekki.id);
    const entries = await entriesFor(pool, orgA.id, charge.number ?? '');
    expect(entries).not.toHaveLength(0);
    expect(entries.every((row) => row.campus_id === lekki.id)).toBe(true);
    const [activity] = await financeActivityRows(pool, orgA.id);
    expect(activity?.campus_id).toBe(lekki.id);
  });
});

test.describe('replaying a reference', () => {
  test('the same body answers 200 replayed with one charge and one entry', async ({
    api,
    pool,
    schools: { lekkiOnly, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const body = chargeBody(studentLekki.id, fees);
    const first = await added(api, lekkiOnly, body);

    const again = await post(api, lekkiOnly, body).expect(200);

    expect(again.body).toMatchObject({
      id: first.id,
      number: first.number,
      replayed: true,
    });
    expect(await adhocTables(pool)).toEqual({ invoices: 1, entries: 1 });
  });

  test('two posts at once make one charge', async ({
    api,
    pool,
    schools: { lekkiOnly, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const body = chargeBody(studentLekki.id, fees);

    const results = await Promise.all([
      post(api, lekkiOnly, body),
      post(api, lekkiOnly, body),
    ]);

    expect(results.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([
      200, 201,
    ]);
    expect(await adhocTables(pool)).toEqual({ invoices: 1, entries: 1 });
  });

  test('another amount, description, fee type or line order answers 409 naming the number', async ({
    api,
    pool,
    schools: { lekkiOnly, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const body = chargeBody(studentLekki.id, fees);
    const first = await added(api, lekkiOnly, body);
    const [trip, card] = body.lines;
    const variants: CreateOneOffCharge[] = [
      { ...body, lines: [{ ...trip, amountMinor: TRIP + 1 }, card] },
      { ...body, lines: [{ ...trip, description: 'School outing' }, card] },
      { ...body, lines: [{ ...trip, feeTypeId: fees.bus }, card] },
      { ...body, lines: [card, trip] },
      { ...body, lines: [trip] },
    ] as CreateOneOffCharge[];

    for (const variant of variants) {
      const res = await post(api, lekkiOnly, variant).expect(409);
      expect(res.body.message).toBe(
        invoiceReferenceUsedMessage(body.reference, first.number ?? '')
      );
    }
    expect(await adhocTables(pool)).toEqual({ invoices: 1, entries: 1 });
  });

  test('a reference used by a charge outside the caller’s campuses answers 409 without the number', async ({
    api,
    schools: { owner, lekkiOnly, studentIkeja, studentLekki },
  }) => {
    const fees = await feeTypes(api, owner);
    const body = chargeBody(studentIkeja.id, fees);
    const atIkeja = await added(api, owner, body);

    const res = await post(api, lekkiOnly, {
      ...body,
      studentId: studentLekki.id,
    }).expect(409);

    expect(res.body.message).toBe(INVOICE_REFERENCE_TAKEN_MESSAGE);
    expect(JSON.stringify(res.body)).not.toContain(atIkeja.number ?? 'none');
  });
});

test.describe('refusals', () => {
  test('a student who has left answers 409', async ({
    api,
    pool,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    await api(owner)
      .post(`/students/${studentLekki.id}/leave`)
      .send({ reason: 'relocated', lastDay: studentLekki.admittedOn })
      .expect(201);

    const res = await post(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    ).expect(409);

    expect(res.body.message).toBe(INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE);
    expect(await adhocTables(pool)).toEqual({ invoices: 0, entries: 0 });
  });

  test('a student away for a long time can still be charged', async ({
    api,
    clock,
    schools: { owner, lekkiOnly, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    await api(owner)
      .post(`/students/${studentLekki.id}/not-seen`)
      .send({ date: studentLekki.admittedOn })
      .expect(201);
    clock.set('2026-12-31');

    await post(api, lekkiOnly, chargeBody(studentLekki.id, fees)).expect(201);
  });

  test('no current term answers 409', async ({
    api,
    pool,
    schools: { lekkiOnly, orgA, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    await pool.query(
      'UPDATE term SET is_current = FALSE WHERE organization_id = $1',
      [orgA.id]
    );

    const res = await post(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    ).expect(409);

    expect(res.body.message).toBe(INVOICE_NO_TERM_MESSAGE);
    expect(await adhocTables(pool)).toEqual({ invoices: 0, entries: 0 });
  });

  test('a retired, unknown or other school’s fee type answers 404', async ({
    api,
    pool,
    schools: { lekkiOnly, ownerB, orgA, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const feesB = await feeTypes(api, ownerB);
    const refused = async (feeTypeId: string) => {
      const res = await post(
        api,
        lekkiOnly,
        chargeBody(studentLekki.id, fees, {
          lines: [{ feeTypeId, description: 'Trip', amountMinor: TRIP }],
        })
      ).expect(404);
      expect(res.body.message).toBe(FEE_TYPE_NOT_FOUND_MESSAGE);
    };

    await refused('0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11');
    await refused(feesB.tuition);
    await pool.query(
      `UPDATE ledger_account SET retired_at = now() WHERE id = $1 AND organization_id = $2`,
      [fees.bus, orgA.id]
    );
    await refused(fees.bus);
    expect(await adhocTables(pool)).toEqual({ invoices: 0, entries: 0 });
  });

  test('4060 Other charges is not a fee type a line can use', async ({
    api,
    pool,
    schools: { lekkiOnly, orgA, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM ledger_account WHERE organization_id = $1 AND code = 4060`,
      [orgA.id]
    );

    await post(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees, {
        lines: [
          {
            feeTypeId: rows[0]?.id ?? '',
            description: 'Other',
            amountMinor: TRIP,
          },
        ],
      })
    ).expect(404);
  });

  test('a bad body answers 400', async ({
    api,
    schools: { lekkiOnly, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const base = chargeBody(studentLekki.id, fees);

    await post(api, lekkiOnly, { ...base, lines: [] }).expect(400);
    await post(api, lekkiOnly, {
      ...base,
      lines: Array.from({ length: 21 }, () => base.lines[0]),
    } as CreateOneOffCharge).expect(400);
    await post(api, lekkiOnly, { ...base, reference: ' ' }).expect(400);
  });

  test('an administrator and a principal, who only read charges, get 403', async ({
    api,
    addMember,
    createUser,
    pool,
    schools: { lekkiOnly, orgA, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const administrator = await addMember(orgA, await createUser(), {
      roles: ['administrator'],
    });
    const principal = await addMember(orgA, await createUser(), {
      roles: ['principal'],
    });

    for (const reader of [administrator, principal]) {
      await post(api, reader, chargeBody(studentLekki.id, fees)).expect(403);
      await api(reader).get('/invoices').expect(200);
    }
    expect(await adhocTables(pool)).toEqual({ invoices: 0, entries: 0 });
  });
});

test.describe('isolation', () => {
  test('another school’s student, charge and fee type answer 404 (cases 1 and 7)', async ({
    api,
    schools: { lekkiOnly, ownerB, studentLekki, studentB },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const feesB = await feeTypes(api, ownerB);
    const charge = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees)
    );

    await api(ownerB).get(`/invoices/${charge.id}`).expect(404);
    const asB = await post(
      api,
      ownerB,
      chargeBody(studentLekki.id, feesB)
    ).expect(404);
    expect(asB.body.message).toBe(INVOICE_STUDENT_NOT_FOUND_MESSAGE);
    await post(api, ownerB, chargeBody(studentB.id, fees)).expect(404);
    await post(api, lekkiOnly, chargeBody(studentB.id, fees)).expect(404);
    expect((await invoicesOf(api, ownerB)).total).toBe(0);
  });

  test('a Lekki bursar cannot charge an Ikeja student, and the Lekki list hides an Ikeja one-off charge (case 3)', async ({
    api,
    pool,
    schools: { owner, lekkiOnly, studentIkeja, studentLekki },
  }) => {
    const fees = await feeTypes(api, owner);
    const atIkeja = await added(api, owner, chargeBody(studentIkeja.id, fees));
    const mine = await added(api, lekkiOnly, chargeBody(studentLekki.id, fees));
    const before = await adhocTables(pool);

    const res = await post(
      api,
      lekkiOnly,
      chargeBody(studentIkeja.id, fees)
    ).expect(404);

    expect(res.body.message).toBe(INVOICE_STUDENT_NOT_FOUND_MESSAGE);
    expect(await adhocTables(pool)).toEqual(before);
    await api(lekkiOnly).get(`/invoices/${atIkeja.id}`).expect(404);
    const list = await invoicesOf(api, lekkiOnly, '?kind=adhoc');
    expect(list.items.map((item) => item.id)).toEqual([mine.id]);
    expect(list.counts.adhoc).toBe(1);
    expect((await invoicesOf(api, owner, '?kind=adhoc')).total).toBe(2);
  });

  test('another school using the same reference gets its own charge and never sees this school’s (case 1)', async ({
    api,
    pool,
    schools: { lekkiOnly, ownerB, studentLekki, studentB },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const feesB = await feeTypes(api, ownerB);
    const reference = freshReference();
    const atA = await added(
      api,
      lekkiOnly,
      chargeBody(studentLekki.id, fees, { reference })
    );

    const res = await post(
      api,
      ownerB,
      chargeBody(studentB.id, feesB, { reference })
    ).expect(201);

    const atB = res.body as CreatedCharge;
    expect(atB).toMatchObject({
      replayed: false,
      student: { id: studentB.id },
    });
    expect(atB.id).not.toBe(atA.id);
    expect(JSON.stringify(res.body)).not.toContain(atA.id);
    expect(await adhocTables(pool)).toEqual({ invoices: 2, entries: 2 });
    expect((await invoicesOf(api, ownerB, '?kind=adhoc')).total).toBe(1);
  });

  test('no permission gets 403 and no session gets 401 (cases 5 and 6)', async ({
    api,
    schools: { lekkiOnly, noPermission, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const body = chargeBody(studentLekki.id, fees);

    await post(api, noPermission, body).expect(403);
    await api().post('/invoices').send(body).expect(401);
  });

  test('the same reference sent twice makes one charge (case 10)', async ({
    api,
    pool,
    schools: { lekkiOnly, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const body = chargeBody(studentLekki.id, fees);

    await post(api, lekkiOnly, body).expect(201);
    const second = await post(api, lekkiOnly, body).expect(200);

    expect(second.body.replayed).toBe(true);
    expect(await adhocTables(pool)).toEqual({ invoices: 1, entries: 1 });
  });

  test('an acting super admin without a reason cannot add a charge (case 12)', async ({
    api,
    pool,
    createUser,
    makeSuperAdmin,
    schools: { orgA, owner, studentLekki },
  }) => {
    const fees = await feeTypes(api, owner);
    const admin = await makeSuperAdmin(await createUser());

    const res = await api(admin)
      .post('/invoices')
      .set(acting(orgA.id))
      .send(chargeBody(studentLekki.id, fees))
      .expect(403);

    expect(res.body).toMatchObject({ code: 'ActingReadOnly' });
    expect(await adhocTables(pool)).toEqual({ invoices: 0, entries: 0 });
    await api(admin).get('/invoices').set(acting(orgA.id)).expect(200);
  });
});

test.describe('under the reference lock', () => {
  for (const [name, hashOf] of [
    ['another body', () => 'another-body'],
    ['the same body', chargeRequestHash],
  ] as const) {
    test(`a charge on a campus the caller cannot see, made while it waited (${name}), answers 409 without the number`, async ({
      api,
      pool,
      schools: { lekkiOnly, orgA, ikeja, studentIkeja, studentLekki },
    }) => {
      const fees = await feeTypes(api, lekkiOnly);
      const body = chargeBody(studentLekki.id, fees);
      const termId = await currentTermId(pool, orgA.id);

      const res = await whileLockedOut(
        pool,
        { organizationId: orgA.id, reference: body.reference },
        {
          send: () => post(api, lekkiOnly, body).then((reply) => reply),
          meanwhile: async (held) => {
            await held.query(
              `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind, reference, request_hash)
             VALUES ($1, $2, $3, $4, 'adhoc', $5, $6)`,
              [
                orgA.id,
                studentIkeja.id,
                termId,
                ikeja.id,
                body.reference,
                hashOf(body),
              ]
            );
          },
        }
      );

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(INVOICE_REFERENCE_TAKEN_MESSAGE);
      expect(await adhocTables(pool)).toEqual({ invoices: 1, entries: 0 });
    });
  }

  test('a student who moved out of the caller’s campuses while it waited answers 404 and posts nothing', async ({
    api,
    app,
    pool,
    schools: { owner, lekkiOnly, orgA, ikeja, studentLekki },
  }) => {
    const fees = await feeTypes(api, lekkiOnly);
    const body = chargeBody(studentLekki.id, fees);
    const ikejaArm = await createClass(app, owner, { campusId: ikeja.id });

    const res = await whileLockedOut(
      pool,
      { organizationId: orgA.id, reference: body.reference },
      {
        send: () => post(api, lekkiOnly, body).then((reply) => reply),
        meanwhile: () =>
          placeAt(
            pool,
            { organizationId: orgA.id, id: studentLekki.id },
            { id: ikejaArm.id, campusId: ikeja.id }
          ),
      }
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe(INVOICE_STUDENT_NOT_FOUND_MESSAGE);
    expect(await adhocTables(pool)).toEqual({ invoices: 0, entries: 0 });
  });

  for (const refusal of [
    {
      name: 'a student who left the roll',
      status: 409,
      message: INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE,
      change: async ({ api, owner, student }: Meanwhile) => {
        await api(owner)
          .post(`/students/${student.id}/leave`)
          .send({ reason: 'relocated', lastDay: student.admittedOn })
          .expect(201);
      },
    },
    {
      name: 'a fee type that was retired',
      status: 404,
      message: FEE_TYPE_NOT_FOUND_MESSAGE,
      change: async ({ pool, orgId, fees }: Meanwhile) => {
        await pool.query(
          'UPDATE ledger_account SET retired_at = now() WHERE id = $1 AND organization_id = $2',
          [fees.bus, orgId]
        );
      },
    },
    {
      name: 'the current term ending',
      status: 409,
      message: INVOICE_NO_TERM_MESSAGE,
      change: async ({ pool, orgId }: Meanwhile) => {
        await pool.query(
          'UPDATE term SET is_current = FALSE WHERE organization_id = $1',
          [orgId]
        );
      },
    },
  ]) {
    test(`${refusal.name} while it waited answers ${refusal.status} and posts nothing`, async ({
      api,
      pool,
      schools: { owner, lekkiOnly, orgA, studentLekki },
    }) => {
      const fees = await feeTypes(api, lekkiOnly);
      const body = chargeBody(studentLekki.id, fees);

      const res = await whileLockedOut(
        pool,
        { organizationId: orgA.id, reference: body.reference },
        {
          send: () => post(api, lekkiOnly, body).then((reply) => reply),
          meanwhile: () =>
            refusal.change({
              api,
              pool,
              owner,
              orgId: orgA.id,
              fees,
              student: studentLekki,
            }),
        }
      );

      expect(res.status).toBe(refusal.status);
      expect(res.body.message).toBe(refusal.message);
      expect(await adhocTables(pool)).toEqual({ invoices: 0, entries: 0 });
    });
  }
});
