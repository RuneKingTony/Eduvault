import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { expect } from './support/base-test';
import {
  addDiscount,
  chargeFixture,
  firstIdIn,
  prepare,
  runOf,
  sendRun,
} from './support/factories/billing';
import { ledgerAccountId, postEntry } from './support/factories/finance';
import { schoolsTest as test } from './support/two-schools';

const rejects = async (
  pool: Pool,
  statement: [sql: string, values: unknown[]],
  pattern: RegExp
) => {
  await expect(pool.query(...statement)).rejects.toThrow(pattern);
};

const insertDraft = (
  pool: Pool,
  v: {
    organizationId: string;
    studentId: string;
    termId: string;
    campusId: string;
    runId?: string | null;
    kind?: string;
    reference?: string | null;
  }
) =>
  pool.query(
    `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, billing_run_id, kind, reference, request_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      v.organizationId,
      v.studentId,
      v.termId,
      v.campusId,
      v.runId ?? null,
      v.kind ?? 'store',
      v.reference ?? null,
      v.reference === undefined || v.reference === null ? null : 'hash',
    ]
  );

const schoolBRows = async (
  app: INestApplication,
  pool: Pool,
  v: {
    organizationId: string;
    studentId: string;
    termId: string;
    levelId: string;
    accountId: string;
  }
) => {
  const first = async (statement: string, values: unknown[]) =>
    (await pool.query<{ id: string }>(statement, values)).rows[0]?.id ?? '';
  const [runId, entry, feeLineId, discountId] = await Promise.all([
    first(
      `INSERT INTO billing_run (organization_id, number, term_id, scope)
       VALUES ($1, 'BR-B', $2, 'school') RETURNING id`,
      [v.organizationId, v.termId]
    ),
    postEntry(app, {
      organizationId: v.organizationId,
      reference: 'B-ENTRY',
      kind: 'adhoc',
      effectiveOn: '2026-10-01',
      postedBy: null,
      lines: [
        {
          ledgerAccountId: await ledgerAccountId(pool, v.organizationId, 1100),
          studentId: v.studentId,
          campusId: null,
          debitMinor: 100,
          creditMinor: 0,
        },
        {
          ledgerAccountId: v.accountId,
          campusId: null,
          debitMinor: 0,
          creditMinor: 100,
        },
      ],
    }),
    first(
      `INSERT INTO fee_line (organization_id, term_id, class_level_id, ledger_account_id, name, amount_minor)
       VALUES ($1, $2, $3, $4, 'B tuition', 100) RETURNING id`,
      [v.organizationId, v.termId, v.levelId, v.accountId]
    ),
    first(
      `INSERT INTO student_discount (organization_id, student_id, kind, value, reason, from_term_id)
       VALUES ($1, $2, 'fixed', 100, 'B discount', $3) RETURNING id`,
      [v.organizationId, v.studentId, v.termId]
    ),
  ]);
  return { runId, entryId: entry.entry.id, feeLineId, discountId };
};

test.describe('invoice constraints', () => {
  test('refuses to change or delete a sent charge and its lines', async ({
    api,
    app,
    pool,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const sent = await sendRun(api, owner, runId ?? '');
    const id = sent.charges[0]?.id ?? '';

    await rejects(
      pool,
      [
        `UPDATE invoice SET campus_id = campus_id, status = 'cancelled' WHERE id = $1`,
        [id],
      ],
      /cannot change/
    );
    await rejects(
      pool,
      [`UPDATE invoice SET number = 'CHG-X' WHERE id = $1`, [id]],
      /cannot change/
    );
    await rejects(
      pool,
      [`DELETE FROM invoice WHERE id = $1`, [id]],
      /never deleted/
    );
    await rejects(
      pool,
      [`UPDATE invoice_line SET amount_minor = 1 WHERE invoice_id = $1`, [id]],
      /cannot change/
    );
    await rejects(
      pool,
      [`DELETE FROM invoice_line WHERE invoice_id = $1`, [id]],
      /cannot change/
    );
    await rejects(
      pool,
      [
        `INSERT INTO invoice_line (organization_id, invoice_id, ledger_account_id, description, amount_minor)
       SELECT organization_id, id, (SELECT id FROM ledger_account WHERE organization_id = invoice.organization_id AND code = 4010), 'Late', 100
       FROM invoice WHERE id = $1`,
        [id],
      ],
      /cannot change/
    );
  });

  test('refuses to move a draft line into a sent charge or a charge of another school', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, orgB, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const sentId = (await sendRun(api, owner, runId ?? '')).charges[0]?.id;
    const draft = await insertDraft(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      termId: fixture.firstTermId,
      campusId: lekki.id,
    });
    const draftId = draft.rows[0].id as string;
    const account = await ledgerAccountId(pool, orgA.id, 4010);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO invoice_line (organization_id, invoice_id, ledger_account_id, description, amount_minor)
       VALUES ($1, $2, $3, 'Late', 100) RETURNING id`,
      [orgA.id, draftId, account]
    );
    const lineId = rows[0]?.id ?? '';

    await rejects(
      pool,
      [
        `UPDATE invoice_line SET invoice_id = $2 WHERE id = $1`,
        [lineId, sentId],
      ],
      /cannot move/
    );
    await rejects(
      pool,
      [
        `UPDATE invoice_line SET organization_id = $2 WHERE id = $1`,
        [lineId, orgB.id],
      ],
      /cannot move/
    );
    const kept = await pool.query(
      `SELECT invoice_id FROM invoice_line WHERE id = $1`,
      [lineId]
    );
    expect(kept.rows[0]?.invoice_id).toBe(draftId);
  });

  test('refuses to change a cancelled charge and to delete a draft', async ({
    api,
    app,
    pool,
    schools: { owner },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const draft = (await runOf(api, owner, runId ?? '')).charges[0]?.id ?? '';
    await rejects(
      pool,
      [`DELETE FROM invoice WHERE id = $1`, [draft]],
      /never deleted/
    );
    await rejects(
      pool,
      [
        `UPDATE invoice SET student_id = (SELECT id FROM student WHERE id <> invoice.student_id LIMIT 1) WHERE id = $1`,
        [draft],
      ],
      /only the status, number and issue details/
    );
    await api(owner).post(`/billing-runs/${runId}/cancel`).expect(201);
    await rejects(
      pool,
      [`UPDATE invoice SET status = 'draft' WHERE id = $1`, [draft]],
      /cannot change/
    );
  });

  test('needs a number, a time and an entry exactly when issued', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    await rejects(
      pool,
      [
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind, status, number)
       VALUES ($1, $2, $3, $4, 'store', 'issued', 'CHG-1')`,
        [orgA.id, studentLekki.id, fixture.firstTermId, lekki.id],
      ],
      /invoice_issued_columns/
    );
    await rejects(
      pool,
      [
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind, number)
       VALUES ($1, $2, $3, $4, 'store', 'CHG-2')`,
        [orgA.id, studentLekki.id, fixture.firstTermId, lekki.id],
      ],
      /invoice_issued_columns/
    );
    await rejects(
      pool,
      [
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind)
       VALUES ($1, $2, $3, $4, 'term')`,
        [orgA.id, studentLekki.id, fixture.firstTermId, lekki.id],
      ],
      /invoice_term_in_round/
    );
  });

  test('allows one live term charge per student and term, and a new one after a cancel', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { runId } = await prepare(api, owner, {
      termId: fixture.secondTermId,
      scope: 'school',
    });
    const twin = {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      termId: fixture.secondTermId,
      campusId: lekki.id,
      runId,
      kind: 'term',
    };

    await expect(insertDraft(pool, twin)).rejects.toThrow(
      /invoice_term_student_live_key/
    );
    await api(owner).post(`/billing-runs/${runId}/cancel`).expect(201);
    await insertDraft(pool, twin);
  });

  test('refuses a charge line that is negative without a discount, or a discount that is not negative', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const discount = await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      fromTermId: fixture.firstTermId,
    });
    const { rows } = await insertDraft(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      termId: fixture.firstTermId,
      campusId: lekki.id,
    });
    const invoiceId = rows[0].id as string;
    const account = await ledgerAccountId(pool, orgA.id, 4010);
    const line = (amount: number, discountId: string | null) =>
      pool.query(
        `INSERT INTO invoice_line (organization_id, invoice_id, student_discount_id, ledger_account_id, description, amount_minor)
         VALUES ($1, $2, $3, $4, 'Line', $5)`,
        [orgA.id, invoiceId, discountId, account, amount]
      );

    await expect(line(0, null)).rejects.toThrow(/invoice_line_amount_nonzero/);
    await expect(line(-100, null)).rejects.toThrow(
      /invoice_line_discount_negative/
    );
    await expect(line(100, discount)).rejects.toThrow(
      /invoice_line_discount_negative/
    );
    await line(100, null);
    await line(-100, discount);
  });

  test('keeps a billing round to exactly the id its scope names', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const insert = (scope: string, campusId: string | null) =>
      pool.query(
        `INSERT INTO billing_run (organization_id, number, term_id, scope, scope_campus_id)
         VALUES ($1, 'BR-TEST', $2, $3, $4)`,
        [orgA.id, fixture.firstTermId, scope, campusId]
      );

    await expect(insert('campus', null)).rejects.toThrow(
      /billing_run_scope_matches/
    );
    await expect(insert('school', lekki.id)).rejects.toThrow(
      /billing_run_scope_matches/
    );
    await expect(insert('student', null)).rejects.toThrow(
      /billing_run_scope_check/
    );
    await insert('campus', lekki.id);
    await expect(insert('school', null)).rejects.toThrow(
      /billing_run_organization_id_number_key/
    );
  });
});

test.describe('one-off charge reference constraints', () => {
  test('needs a reference and a hash exactly on a one-off charge', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const draft = {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      termId: fixture.firstTermId,
      campusId: lekki.id,
    };

    await expect(
      insertDraft(pool, { ...draft, kind: 'adhoc' })
    ).rejects.toThrow(/invoice_adhoc_reference/);
    await expect(
      insertDraft(pool, { ...draft, kind: 'store', reference: 'ONEOFF-1' })
    ).rejects.toThrow(/invoice_adhoc_reference/);
    await expect(
      pool.query(
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind, reference)
         VALUES ($1, $2, $3, $4, 'adhoc', 'ONEOFF-2')`,
        [orgA.id, studentLekki.id, fixture.firstTermId, lekki.id]
      )
    ).rejects.toThrow(/invoice_adhoc_reference/);
    await expect(
      insertDraft(pool, { ...draft, kind: 'adhoc', reference: ' ' })
    ).rejects.toThrow(/invoice_reference_check/);
    await expect(
      insertDraft(pool, { ...draft, kind: 'adhoc', reference: 'x'.repeat(81) })
    ).rejects.toThrow(/invoice_reference_check/);
    await expect(
      insertDraft(pool, { ...draft, kind: 'adhoc', reference: 'ONEOFF-3' })
    ).resolves.toBeDefined();
  });

  test('refuses a reference twice in one school and allows it in another', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, orgB, campusB, lekki, studentB, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const termBId =
      (
        await pool.query<{ id: string }>(
          `SELECT id FROM term WHERE organization_id = $1 LIMIT 1`,
          [orgB.id]
        )
      ).rows[0]?.id ?? '';
    const inA = {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      termId: fixture.firstTermId,
      campusId: lekki.id,
      kind: 'adhoc',
      reference: 'ONEOFF-SAME',
    };

    await insertDraft(pool, inA);
    await expect(insertDraft(pool, inA)).rejects.toThrow(
      /invoice_reference_key/
    );
    await expect(
      insertDraft(pool, {
        organizationId: orgB.id,
        studentId: studentB.id,
        termId: termBId,
        campusId: campusB.id,
        kind: 'adhoc',
        reference: 'ONEOFF-SAME',
      })
    ).resolves.toBeDefined();
  });

  test('freezes the reference and the hash after insert', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { rows } = await insertDraft(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      termId: fixture.firstTermId,
      campusId: lekki.id,
      kind: 'adhoc',
      reference: 'ONEOFF-FROZEN',
    });
    const id = rows[0].id as string;

    await rejects(
      pool,
      [`UPDATE invoice SET reference = 'ONEOFF-OTHER' WHERE id = $1`, [id]],
      /only the status, number and issue details/
    );
    await rejects(
      pool,
      [`UPDATE invoice SET request_hash = 'other' WHERE id = $1`, [id]],
      /only the status, number and issue details/
    );
  });
});

test.describe('student discount constraints', () => {
  test('refuses self-approval, a percent above 100 and a half-filled decision', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM "user" WHERE id = (SELECT "userId" FROM member WHERE "organizationId" = $1 LIMIT 1)`,
      [orgA.id]
    );
    const user = rows[0]?.id ?? '';
    const insert = (over: Partial<Record<string, string | number | null>>) => {
      const row = {
        kind: 'percent',
        value: 5,
        status: 'submitted',
        created_by: user,
        approved_by: null,
        approved_at: null,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
        ...over,
      };
      return pool.query(
        `INSERT INTO student_discount
           (organization_id, student_id, kind, value, reason, from_term_id, status,
            created_by, approved_by, approved_at, rejected_by, rejected_at, rejection_reason)
         VALUES ($1, $2, $3, $4, 'Reason', $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          orgA.id,
          studentLekki.id,
          row.kind,
          row.value,
          fixture.firstTermId,
          row.status,
          row.created_by,
          row.approved_by,
          row.approved_at,
          row.rejected_by,
          row.rejected_at,
          row.rejection_reason,
        ]
      );
    };

    await expect(
      insert({
        status: 'approved',
        approved_by: user,
        approved_at: '2026-10-01',
      })
    ).rejects.toThrow(/student_discount_approved_not_self/);
    await expect(
      insert({
        status: 'rejected',
        rejected_by: user,
        rejected_at: '2026-10-01',
        rejection_reason: 'No',
      })
    ).rejects.toThrow(/student_discount_rejected_not_self/);
    await expect(insert({ value: 101 })).rejects.toThrow(
      /student_discount_percent_range/
    );
    await expect(insert({ value: 0 })).rejects.toThrow(
      /student_discount_value_positive/
    );
    await expect(insert({ status: 'approved' })).rejects.toThrow(
      /student_discount_approved_columns/
    );
    await expect(insert({ status: 'rejected' })).rejects.toThrow(
      /student_discount_rejected_columns/
    );
    await insert({ kind: 'fixed', value: 500_000 });
  });
});

test.describe('composite foreign keys', () => {
  test('7: refuses a row in school A that references school B’s student, campus, term, account, round, entry, fee line, discount or level', async ({
    api,
    app,
    pool,
    schools: { owner, orgA, orgB, campusB, studentB, lekki, studentLekki },
  }) => {
    const fixture = await chargeFixture(app, api, owner);
    const termBId = (
      await pool.query<{ id: string }>(
        `SELECT id FROM term WHERE organization_id = $1 LIMIT 1`,
        [orgB.id]
      )
    ).rows[0]?.id;
    const accountB = await ledgerAccountId(pool, orgB.id, 4010);

    const foreign = /foreign key/;
    await rejects(
      pool,
      [
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind) VALUES ($1, $2, $3, $4, 'store')`,
        [orgA.id, studentB.id, fixture.firstTermId, lekki.id],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind) VALUES ($1, $2, $3, $4, 'store')`,
        [orgA.id, studentLekki.id, termBId, lekki.id],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind) VALUES ($1, $2, $3, $4, 'store')`,
        [orgA.id, studentLekki.id, fixture.firstTermId, campusB.id],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO billing_run (organization_id, number, term_id, scope) VALUES ($1, 'BR-X', $2, 'school')`,
        [orgA.id, termBId],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO billing_run (organization_id, number, term_id, scope, scope_campus_id) VALUES ($1, 'BR-X', $2, 'campus', $3)`,
        [orgA.id, fixture.firstTermId, campusB.id],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO student_discount (organization_id, student_id, kind, value, reason, from_term_id)
       VALUES ($1, $2, 'fixed', 100, 'x', $3)`,
        [orgA.id, studentB.id, fixture.firstTermId],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO student_discount (organization_id, student_id, kind, value, reason, from_term_id, ledger_account_id)
       VALUES ($1, $2, 'fixed', 100, 'x', $3, $4)`,
        [orgA.id, studentLekki.id, fixture.firstTermId, accountB],
      ],
      foreign
    );
    const { rows } = await insertDraft(pool, {
      organizationId: orgA.id,
      studentId: studentLekki.id,
      termId: fixture.firstTermId,
      campusId: lekki.id,
    });
    const insertLine = `INSERT INTO invoice_line (organization_id, invoice_id, ledger_account_id, description, amount_minor)
       VALUES ($1, $2, $3, 'x', 100)`;
    const invoiceId = rows[0].id as string;
    await rejects(pool, [insertLine, [orgA.id, invoiceId, accountB]], foreign);
    await rejects(pool, [insertLine, [orgB.id, invoiceId, accountB]], foreign);

    const levelBId = await firstIdIn(pool, 'class_level', orgB.id);
    const rowsB = await schoolBRows(app, pool, {
      organizationId: orgB.id,
      studentId: studentB.id,
      termId: termBId ?? '',
      levelId: levelBId,
      accountId: accountB,
    });
    await rejects(
      pool,
      [
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind, billing_run_id)
         VALUES ($1, $2, $3, $4, 'term', $5)`,
        [orgA.id, studentLekki.id, fixture.firstTermId, lekki.id, rowsB.runId],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO invoice (organization_id, student_id, term_id, campus_id, kind, status, number, issued_at, journal_entry_id)
         VALUES ($1, $2, $3, $4, 'store', 'issued', 'CHG-FK', now(), $5)`,
        [
          orgA.id,
          studentLekki.id,
          fixture.firstTermId,
          lekki.id,
          rowsB.entryId,
        ],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO invoice_line (organization_id, invoice_id, fee_line_id, ledger_account_id, description, amount_minor)
         VALUES ($1, $2, $3, $4, 'x', 100)`,
        [
          orgA.id,
          invoiceId,
          rowsB.feeLineId,
          await ledgerAccountId(pool, orgA.id, 4010),
        ],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO invoice_line (organization_id, invoice_id, student_discount_id, ledger_account_id, description, amount_minor)
         VALUES ($1, $2, $3, $4, 'x', -100)`,
        [
          orgA.id,
          invoiceId,
          rowsB.discountId,
          await ledgerAccountId(pool, orgA.id, 5000),
        ],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO billing_run (organization_id, number, term_id, scope, scope_class_level_id)
         VALUES ($1, 'BR-X', $2, 'level', $3)`,
        [orgA.id, fixture.firstTermId, levelBId],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO student_discount (organization_id, student_id, kind, value, reason, from_term_id, to_term_id)
         VALUES ($1, $2, 'fixed', 100, 'x', $3, $4)`,
        [orgA.id, studentLekki.id, fixture.firstTermId, termBId],
      ],
      foreign
    );
    await rejects(
      pool,
      [
        `INSERT INTO student_discount (organization_id, student_id, kind, value, reason, from_term_id)
         VALUES ($1, $2, 'fixed', 100, 'x', $3)`,
        [orgA.id, studentLekki.id, termBId],
      ],
      foreign
    );
  });
});
