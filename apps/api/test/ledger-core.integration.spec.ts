import type { Pool, PoolClient } from 'pg';
import { KYSELY_TOKEN, type Database } from '../src/app/common/db/tokens';
import { allocateDocumentNumber } from '../src/app/common/documents';
import { LedgerPoster } from '../src/app/common/ledger';
import { expect } from './support/base-test';
import { ledgerAccountId, postEntry } from './support/factories/finance';
import { schoolsTest as test } from './support/two-schools';

const byName = (a: string, b: string) => a.localeCompare(b);

const SYSTEM_KEYS = [
  'fees_receivable',
  'money_accounts',
  'store_stock',
  'customer_credit_refunds',
  'opening_balance_equity',
  'fee_income',
  'store_sales',
  'discounts_given',
  'bad_debt',
  'store_cost',
  'store_losses',
];

interface RawLine {
  accountId: string;
  debit?: number;
  credit?: number;
  studentId?: string | null;
  campusId?: string | null;
}

async function rawEntry(
  pool: Pool,
  input: { organizationId: string; reference: string; lines: RawLine[] }
): Promise<string> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO journal_entry (organization_id, reference, kind, effective_on)
       VALUES ($1, $2, 'opening', '2026-09-01') RETURNING id`,
      [input.organizationId, input.reference]
    );
    const entryId = rows[0]?.id ?? '';
    for (const line of input.lines) {
      await client.query(
        `INSERT INTO journal_line
           (organization_id, entry_id, ledger_account_id, student_id, campus_id, debit_minor, credit_minor)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.organizationId,
          entryId,
          line.accountId,
          line.studentId ?? null,
          line.campusId ?? null,
          line.debit ?? 0,
          line.credit ?? 0,
        ]
      );
    }
    await client.query('COMMIT');
    return entryId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const countOf = async (pool: Pool, sql: string, values: unknown[]) => {
  const { rows } = await pool.query<{ count: string }>(sql, values);
  return Number(rows[0]?.count);
};

test.describe('the chart', () => {
  test('gives a new school the eleven system accounts and eight fee types, and seeding twice changes nothing', async ({
    pool,
    schools,
  }) => {
    const { orgA } = schools;
    const keys = await pool.query<{ system_key: string }>(
      `SELECT system_key FROM ledger_account
       WHERE organization_id = $1 AND system_key IS NOT NULL`,
      [orgA.id]
    );
    expect(keys.rows.map((row) => row.system_key).toSorted(byName)).toEqual(
      [...SYSTEM_KEYS, 'other_charges'].toSorted(byName)
    );
    const fees = await pool.query<{ code: number; name: string }>(
      `SELECT c.code, c.name FROM ledger_account c
       JOIN ledger_account p ON p.id = c.parent_id AND p.organization_id = c.organization_id
       WHERE c.organization_id = $1 AND p.system_key = 'fee_income' ORDER BY c.code`,
      [orgA.id]
    );
    expect(fees.rows).toEqual([
      { code: 4010, name: 'Tuition' },
      { code: 4020, name: 'PTA fee' },
      { code: 4030, name: 'School bus' },
      { code: 4040, name: 'Development levy' },
      { code: 4050, name: 'Laboratory fee' },
      { code: 4060, name: 'Other charges' },
      { code: 4070, name: 'Excursion levy' },
      { code: 4080, name: 'Graduation fee' },
    ]);

    const total = () =>
      countOf(
        pool,
        'SELECT count(*) FROM ledger_account WHERE organization_id = $1',
        [orgA.id]
      );
    expect(await total()).toBe(19);
    await pool.query('SELECT seed_ledger_accounts($1)', [orgA.id]);
    await pool.query('SELECT seed_ledger_accounts($1)', [orgA.id]);
    expect(await total()).toBe(19);
  });

  test('backfills a school created before the migration', async ({
    pool,
    schools,
  }) => {
    const { orgA, orgB } = schools;
    await pool.query('DELETE FROM ledger_account WHERE organization_id = $1', [
      orgA.id,
    ]);
    expect(
      await countOf(
        pool,
        'SELECT count(*) FROM ledger_account WHERE organization_id = $1',
        [orgA.id]
      )
    ).toBe(0);
    await pool.query(`SELECT seed_ledger_accounts("id") FROM "organization"`);
    await pool.query(`SELECT seed_ledger_accounts("id") FROM "organization"`);
    for (const org of [orgA, orgB]) {
      expect(
        await countOf(
          pool,
          'SELECT count(*) FROM ledger_account WHERE organization_id = $1',
          [org.id]
        )
      ).toBe(19);
    }
  });

  test('refuses to retire, re-parent or retype a system account, but allows the rest', async ({
    pool,
    schools,
  }) => {
    const { orgA } = schools;
    const fees = await ledgerAccountId(pool, orgA.id, 4000);
    const tuition = await ledgerAccountId(pool, orgA.id, 4010);
    const refused = (sql: string, values: unknown[]) =>
      expect(pool.query(sql, values)).rejects.toMatchObject({
        code: '23514',
        constraint: 'ledger_account_system_fixed',
      });
    await refused(
      'UPDATE ledger_account SET retired_at = now() WHERE id = $1',
      [fees]
    );
    await refused(`UPDATE ledger_account SET type = 'asset' WHERE id = $1`, [
      fees,
    ]);
    await refused('UPDATE ledger_account SET parent_id = $2 WHERE id = $1', [
      fees,
      tuition,
    ]);
    await refused(`UPDATE ledger_account SET system_key = 'x' WHERE id = $1`, [
      fees,
    ]);
    await pool.query(
      'UPDATE ledger_account SET retired_at = now() WHERE id = $1',
      [tuition]
    );
  });
});

test.describe('the journal', () => {
  test('refuses an unbalanced, single-line or empty entry at commit', async ({
    pool,
    schools,
  }) => {
    const { orgA } = schools;
    const money = await ledgerAccountId(pool, orgA.id, 1200);
    const equity = await ledgerAccountId(pool, orgA.id, 3000);
    const balanced = (reference: string, lines: RawLine[]) =>
      rawEntry(pool, { organizationId: orgA.id, reference, lines });

    await expect(
      balanced('UNBALANCED', [
        { accountId: money, debit: 500 },
        { accountId: equity, credit: 400 },
      ])
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'journal_entry_balanced',
    });
    await expect(
      balanced('SINGLE', [{ accountId: money, debit: 500 }])
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'journal_entry_balanced',
    });
    await expect(balanced('EMPTY', [])).rejects.toMatchObject({
      code: '23514',
      constraint: 'journal_entry_not_empty',
    });
    expect(await countOf(pool, 'SELECT count(*) FROM journal_entry', [])).toBe(
      0
    );
    await balanced('BALANCED', [
      { accountId: money, debit: 500 },
      { accountId: equity, credit: 500 },
    ]);
    expect(await countOf(pool, 'SELECT count(*) FROM journal_line', [])).toBe(
      2
    );
  });

  test('refuses a line with both sides, neither side or a negative side', async ({
    pool,
    schools,
  }) => {
    const { orgA } = schools;
    const money = await ledgerAccountId(pool, orgA.id, 1200);
    const equity = await ledgerAccountId(pool, orgA.id, 3000);
    for (const line of [
      { debit: 5, credit: 5 },
      { debit: 0, credit: 0 },
      { debit: -5, credit: 0 },
    ]) {
      await expect(
        rawEntry(pool, {
          organizationId: orgA.id,
          reference: `BAD-${line.debit}-${line.credit}`,
          lines: [
            { accountId: money, ...line },
            { accountId: equity, credit: 5 },
          ],
        })
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'journal_line_one_side',
      });
    }
  });

  test('refuses UPDATE and DELETE on an entry or a line, while TRUNCATE works', async ({
    pool,
    schools,
  }) => {
    const { orgA } = schools;
    const money = await ledgerAccountId(pool, orgA.id, 1200);
    const equity = await ledgerAccountId(pool, orgA.id, 3000);
    const entryId = await rawEntry(pool, {
      organizationId: orgA.id,
      reference: 'APPEND-ONLY',
      lines: [
        { accountId: money, debit: 500 },
        { accountId: equity, credit: 500 },
      ],
    });
    const refused = (sql: string) =>
      expect(pool.query(sql, [entryId])).rejects.toMatchObject({
        code: '23514',
        constraint: 'journal_append_only',
      });
    await refused(`UPDATE journal_entry SET memo = 'x' WHERE id = $1`);
    await refused('DELETE FROM journal_entry WHERE id = $1');
    await refused(
      `UPDATE journal_line SET debit_minor = 9 WHERE entry_id = $1`
    );
    await refused('DELETE FROM journal_line WHERE entry_id = $1');

    await pool.query(
      'TRUNCATE TABLE journal_line, journal_entry, invoice_line, invoice, payment_allocation, payment_void, payment, adjustment, stock_delivery_line, stock_delivery'
    );
    expect(await countOf(pool, 'SELECT count(*) FROM journal_entry', [])).toBe(
      0
    );
  });

  test('refuses a second reversal of one entry and a fees-owed line without a student', async ({
    app,
    pool,
    schools,
  }) => {
    const { orgA, studentLekki, lekki } = schools;
    const money = await ledgerAccountId(pool, orgA.id, 1200);
    const equity = await ledgerAccountId(pool, orgA.id, 3000);
    const receivable = await ledgerAccountId(pool, orgA.id, 1100);
    const original = await postEntry(app, {
      organizationId: orgA.id,
      reference: 'ORIGINAL',
      kind: 'opening',
      effectiveOn: '2026-09-01',
      postedBy: null,
      lines: [
        { ledgerAccountId: money, debitMinor: 500, creditMinor: 0 },
        { ledgerAccountId: equity, debitMinor: 0, creditMinor: 500 },
      ],
    });
    const reversal = (reference: string) =>
      postEntry(app, {
        organizationId: orgA.id,
        reference,
        kind: 'payment_void',
        effectiveOn: '2026-09-02',
        postedBy: null,
        reversesEntryId: original.entry.id,
        lines: [
          { ledgerAccountId: money, debitMinor: 0, creditMinor: 500 },
          { ledgerAccountId: equity, debitMinor: 500, creditMinor: 0 },
        ],
      });
    await reversal('REVERSAL-1');
    await expect(reversal('REVERSAL-2')).rejects.toMatchObject({
      code: '23505',
      constraint: 'journal_entry_reverses_key',
    });

    await expect(
      rawEntry(pool, {
        organizationId: orgA.id,
        reference: 'NO-STUDENT',
        lines: [
          { accountId: receivable, debit: 500, campusId: lekki.id },
          { accountId: equity, credit: 500, campusId: lekki.id },
        ],
      })
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'journal_line_requires_student',
    });
    await rawEntry(pool, {
      organizationId: orgA.id,
      reference: 'WITH-STUDENT',
      lines: [
        {
          accountId: receivable,
          debit: 500,
          studentId: studentLekki.id,
          campusId: lekki.id,
        },
        { accountId: equity, credit: 500, campusId: lekki.id },
      ],
    });
  });

  test('refuses a raw delete of a school, campus or student that has journal lines', async ({
    pool,
    schools,
  }) => {
    const { orgA, studentLekki, lekki } = schools;
    const receivable = await ledgerAccountId(pool, orgA.id, 1100);
    const equity = await ledgerAccountId(pool, orgA.id, 3000);
    await rawEntry(pool, {
      organizationId: orgA.id,
      reference: 'HOLDS-THEM',
      lines: [
        {
          accountId: receivable,
          debit: 500,
          studentId: studentLekki.id,
          campusId: lekki.id,
        },
        { accountId: equity, credit: 500, campusId: lekki.id },
      ],
    });
    await expect(
      pool.query('DELETE FROM student WHERE id = $1', [studentLekki.id])
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query('DELETE FROM campus WHERE team_id = $1', [lekki.id])
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query('DELETE FROM "organization" WHERE id = $1', [orgA.id])
    ).rejects.toMatchObject({ code: '23503' });
  });
});

test.describe('document numbers', () => {
  test('give 20 concurrent invoices 20 consecutive numbers, and a second school starts at 1', async ({
    app,
    schools,
  }) => {
    const { orgA, orgB } = schools;
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const allocate = (organizationId: string) =>
      allocateDocumentNumber(db, {
        organizationId,
        kind: 'invoice',
        year: 2026,
      });
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => allocate(orgA.id))
    );
    expect(numbers.toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    expect(await allocate(orgB.id)).toBe(1);
    expect(
      await allocateDocumentNumber(db, {
        organizationId: orgA.id,
        kind: 'invoice',
        year: 2027,
      })
    ).toBe(1);
    expect(
      await allocateDocumentNumber(db, {
        organizationId: orgA.id,
        kind: 'payment',
        year: 2026,
      })
    ).toBe(1);
  });

  test('free the number when the allocation rolls back', async ({
    app,
    schools,
  }) => {
    const { orgA } = schools;
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const key = {
      organizationId: orgA.id,
      kind: 'adjustment',
      year: 2026,
    } as const;
    await expect(
      db.transaction().execute(async (trx) => {
        expect(await allocateDocumentNumber(trx, key)).toBe(1);
        throw new Error('roll back');
      })
    ).rejects.toThrow('roll back');
    expect(await allocateDocumentNumber(db, key)).toBe(1);
    expect(await allocateDocumentNumber(db, key)).toBe(2);
  });

  test('keep admission numbers in one sequence with no year', async ({
    app,
    schools,
  }) => {
    const { orgA } = schools;
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const next = await allocateDocumentNumber(db, {
      organizationId: orgA.id,
      kind: 'admission',
      year: null,
    });
    expect(next).toBeGreaterThan(1);
  });
});

test.describe('the poster', () => {
  test('posts a reference once, even when two posts run at the same time', async ({
    app,
    pool,
    schools,
  }) => {
    const { orgA } = schools;
    const money = await ledgerAccountId(pool, orgA.id, 1200);
    const equity = await ledgerAccountId(pool, orgA.id, 3000);
    const input = {
      organizationId: orgA.id,
      reference: 'ONCE',
      kind: 'opening',
      effectiveOn: '2026-09-01',
      postedBy: null,
      lines: [
        { ledgerAccountId: money, debitMinor: 700, creditMinor: 0 },
        { ledgerAccountId: equity, debitMinor: 0, creditMinor: 700 },
      ],
    } as const;
    const results = await Promise.all([
      postEntry(app, input),
      postEntry(app, input),
    ]);
    expect(
      results
        .map((result) => result.replayed)
        .toSorted((a, b) => Number(a) - Number(b))
    ).toEqual([false, true]);
    expect(results[0].entry.id).toBe(results[1].entry.id);
    expect(
      await countOf(
        pool,
        'SELECT count(*) FROM journal_entry WHERE organization_id = $1',
        [orgA.id]
      )
    ).toBe(1);
    expect(
      await countOf(
        pool,
        'SELECT count(*) FROM journal_line WHERE organization_id = $1',
        [orgA.id]
      )
    ).toBe(2);
  });

  test('refuses an unbalanced entry before any SQL runs, and the same reference in another school posts on its own', async ({
    app,
    pool,
    schools,
  }) => {
    const { orgA, orgB } = schools;
    const poster = app.get(LedgerPoster, { strict: false });
    const db = app.get<Database>(KYSELY_TOKEN, { strict: false });
    const money = await ledgerAccountId(pool, orgA.id, 1200);
    await expect(
      db.transaction().execute((trx) =>
        poster.post(trx, {
          organizationId: orgA.id,
          reference: 'LOPSIDED',
          kind: 'opening',
          effectiveOn: '2026-09-01',
          postedBy: null,
          lines: [{ ledgerAccountId: money, debitMinor: 5, creditMinor: 0 }],
        })
      )
    ).rejects.toThrow('at least two lines');
    expect(await countOf(pool, 'SELECT count(*) FROM journal_entry', [])).toBe(
      0
    );

    for (const org of [orgA, orgB]) {
      const result = await postEntry(app, {
        organizationId: org.id,
        reference: 'SAME-REFERENCE',
        kind: 'opening',
        effectiveOn: '2026-09-01',
        postedBy: null,
        lines: [
          {
            ledgerAccountId: await ledgerAccountId(pool, org.id, 1200),
            debitMinor: 5,
            creditMinor: 0,
          },
          {
            ledgerAccountId: await ledgerAccountId(pool, org.id, 3000),
            debitMinor: 0,
            creditMinor: 5,
          },
        ],
      });
      expect(result.replayed).toBe(false);
    }
  });
});
