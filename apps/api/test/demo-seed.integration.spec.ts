import {
  PROTOTYPE_TODAY,
  seedOffsetDays,
  shiftDate,
} from '../scripts/seed/date-shift';
import { DEMO_ARM_COUNT } from '../scripts/seed/demo/config';
import { COUNTED_TABLES } from '../scripts/seed/demo/demo-check';
import { buildDemoPlan } from '../scripts/seed/demo/plan';
import { runDemoSeed } from '../scripts/seed/demo/run-demo-seed';
import { runSeed } from '../scripts/seed/run-seed';
import { baseTest as test, expect } from './support/base-test';

const NOW = new Date('2026-10-20T10:00:00Z');
const SIZE = { students: 40, teachers: 4 };
const SEED_RUN_TIMEOUT_MS = 600_000;

test.describe('demo seed', () => {
  test(
    'adds a small Riverside to a seeded database, passes its check, leaves the other schools alone and is idempotent',
    { timeout: SEED_RUN_TIMEOUT_MS },
    async ({ app, pool }) => {
      const today = shiftDate(PROTOTYPE_TODAY, seedOffsetDays(NOW));
      const plan = buildDemoPlan(SIZE, today);
      const counts = async () => {
        const { rows } = await pool.query<Record<string, string>>(
          `SELECT ${COUNTED_TABLES.map(
            (table) => `(SELECT count(*) FROM "${table}") AS "${table}"`
          ).join(', ')}`
        );
        return rows[0];
      };
      const scalar = async (query: string) => {
        const { rows } = await pool.query<{ n: string }>(query);
        return Number(rows[0]?.n);
      };

      const otherSchools = async () => {
        const { rows } = await pool.query<Record<string, string>>(
          `SELECT o.slug,
                  (SELECT count(*) FROM student WHERE organization_id = o.id) AS student,
                  (SELECT count(*) FROM guardian WHERE organization_id = o.id) AS guardian,
                  (SELECT count(*) FROM member WHERE "organizationId" = o.id) AS member,
                  (SELECT count(*) FROM class_arm WHERE organization_id = o.id) AS class_arm,
                  (SELECT count(*) FROM fee_line WHERE organization_id = o.id) AS fee_line,
                  (SELECT count(*) FROM invoice WHERE organization_id = o.id) AS invoice,
                  (SELECT count(*) FROM payment WHERE organization_id = o.id) AS payment,
                  (SELECT count(*) FROM wallet WHERE organization_id = o.id) AS wallet,
                  (SELECT count(*) FROM journal_line WHERE organization_id = o.id) AS journal_line
           FROM organization o WHERE o.slug <> 'riverside' ORDER BY o.slug`
        );
        return rows;
      };

      await runSeed(app, { log: () => undefined, now: NOW });
      const untouched = await otherSchools();
      expect(untouched.map((row) => row.slug)).toEqual([
        'greenfield',
        'hilltop',
        'stbrendan',
      ]);

      const lines: string[] = [];
      const first = await runDemoSeed(app, {
        log: (line) => lines.push(line),
        now: NOW,
        size: SIZE,
      });

      expect(first).toEqual({ seeded: true, failures: [] });
      expect(lines.join('\n')).toContain(`seed "today" is ${today}`);
      expect(lines.join('\n')).toContain('demo check passed');
      expect(lines.join('\n')).toContain('owner@riverside.test');
      const inRiverside = `organization_id = (SELECT id FROM organization WHERE slug = 'riverside')`;
      expect(await otherSchools()).toEqual(untouched);
      expect(
        await scalar(`SELECT count(*) AS n FROM student WHERE ${inRiverside}`)
      ).toBe(SIZE.students);
      expect(
        await scalar(
          `SELECT count(*) AS n FROM member WHERE role = 'teacher'
           AND "organizationId" = (SELECT id FROM organization WHERE slug = 'riverside')`
        )
      ).toBe(SIZE.teachers);
      expect(
        await scalar(`SELECT count(*) AS n FROM class_arm WHERE ${inRiverside}`)
      ).toBe(DEMO_ARM_COUNT);
      expect(
        await scalar(`SELECT count(*) AS n FROM guardian WHERE ${inRiverside}`)
      ).toBe(
        plan.families.reduce((total, row) => total + row.guardians.length, 0)
      );

      const paying = plan.payments.filter((payment) => payment.amountMinor > 0);
      expect(
        await scalar(`SELECT count(*) AS n FROM payment WHERE ${inRiverside}`)
      ).toBe(paying.length);
      expect(
        await scalar(
          `SELECT count(*) AS n FROM payment WHERE ${inRiverside} AND reference LIKE 'DEMO-PAY-%'`
        )
      ).toBe(paying.length);
      expect(
        await scalar(
          `SELECT count(*) AS n FROM payment WHERE ${inRiverside} AND proof_file_id IS NOT NULL`
        )
      ).toBe(paying.filter((payment) => payment.method === 'transfer').length);

      const autoPay = plan.wallets.filter((wallet) => wallet.autoPay !== null);
      expect(plan.wallets.length).toBeGreaterThan(0);
      expect(autoPay.length).toBeGreaterThan(0);
      expect(
        await scalar(
          `SELECT count(*) AS n FROM journal_entry WHERE ${inRiverside} AND kind = 'wallet_topup'`
        )
      ).toBe(plan.wallets.length + autoPay.length);
      expect(
        await scalar(
          `SELECT count(*) AS n FROM journal_entry WHERE ${inRiverside} AND reference LIKE 'DEMO-SPEND-%'`
        )
      ).toBe(plan.wallets.length);
      expect(
        await scalar(
          `SELECT count(*) AS n FROM journal_entry WHERE ${inRiverside} AND reference LIKE 'AUTOPAY-%'`
        )
      ).toBeGreaterThanOrEqual(autoPay.length);

      const before = await counts();
      const again: string[] = [];
      const second = await runDemoSeed(app, {
        log: (line) => again.push(line),
        now: NOW,
        size: SIZE,
      });

      expect(second).toEqual({ seeded: false, failures: [] });
      expect(again.join('\n')).toContain('Demo school already seeded');
      expect(await counts()).toEqual(before);
    }
  );
});
