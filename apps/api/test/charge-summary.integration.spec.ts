import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { DASHBOARD_SAMPLE_SIZE } from '@eduvault/api-contract';
import type { OrgContext } from '../src/app/common/auth';
import { BillingPlanService } from '../src/app/modules/billing/billing-plan.service';
import { scopeOf } from '../src/app/modules/billing/billing-scope';
import {
  BillingPlanRepository,
  type TermInfo,
} from '../src/app/modules/billing/billing-plan.repository';
import { expect, type TestUser } from './support/base-test';
import {
  addDiscount,
  chargeFixture,
  prepare,
} from './support/factories/billing';
import { createClass } from './support/factories/classes';
import { createFeeLine, feeFixture } from './support/factories/fees';
import { orgContextFor } from './support/factories/org-context';
import { createStudent } from './support/factories/students';
import { schoolsTest as test } from './support/two-schools';

const TUITION = 1_000_000;
const TODAY = '2026-10-16';
const INACTIVE_BOUNDARY = '2026-09-11';

interface Names {
  first: string;
  last: string;
}

const cmp = (a: string, b: string) => {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
};

const byFirstLastId = (a: Names & { id: string }, b: Names & { id: string }) =>
  cmp(a.first, b.first) || cmp(a.last, b.last) || cmp(a.id, b.id);

async function levelIdsOn(pool: Pool, ctx: OrgContext, term: TermInfo) {
  const { rows } = await pool.query<{ class_level_id: string }>(
    `SELECT DISTINCT en.class_level_id
     FROM student s
     JOIN student_enrollment en
       ON en.student_id = s.id AND en.organization_id = s.organization_id
     WHERE s.organization_id = $1
       AND en.session_id = $2
       AND ($3::text[] IS NULL OR coalesce((
         SELECT p.campus_id
         FROM enrollment_placement p
         JOIN term t ON t.id = p.term_id AND t.is_current
         JOIN student_enrollment e ON e.id = p.enrollment_id
         WHERE e.student_id = s.id
         LIMIT 1
       ), s.campus_id)::text = ANY($3::text[]))`,
    [
      ctx.organizationId,
      term.sessionId,
      ctx.campusScope === 'all' ? null : ctx.campusScope,
    ]
  );
  return rows.map((row) => row.class_level_id).toSorted(cmp);
}

async function termInfos(app: INestApplication, owner: TestUser) {
  const ctx = await orgContextFor(app, owner);
  const repo = app.get(BillingPlanRepository, { strict: false });
  return repo.termsToCharge(ctx.organizationId);
}

test.describe('chargeSummary equals the round plan', () => {
  test('counts, level ids and sample match plan() for every rule, owner and campus-limited bursar', async ({
    api,
    app,
    pool,
    clock,
    schools: {
      owner,
      lekkiOnly,
      orgA,
      lekki,
      ikeja,
      studentLekki,
      studentIkeja,
    },
  }) => {
    clock.set(TODAY);
    const charge = await chargeFixture(app, api, owner);
    const fixture = await feeFixture(app, api, owner);
    const firstFees = { ...fixture, termId: charge.firstTermId };
    const secondFees = { ...fixture, termId: charge.secondTermId };
    const as = { app, actor: owner };

    const arms = new Map<string, string>();
    const armOf = async (campusId: string, levelCode: string) => {
      const key = `${campusId}:${levelCode}`;
      const held = arms.get(key);
      if (held !== undefined) {
        return held;
      }
      const made = await createClass(app, owner, { campusId, levelCode });
      arms.set(key, made.id);
      return made.id;
    };

    interface Admit {
      first: string;
      last?: string;
      campusId: string;
      level: string;
      isNew?: boolean;
    }
    const admit = async (input: Admit) => {
      const student = await createStudent(app, owner, {
        campusId: input.campusId,
        classArmId: await armOf(input.campusId, input.level),
        firstName: input.first,
        lastName: input.last ?? 'Tester',
      });
      await pool.query(
        'UPDATE student_enrollment SET is_new_student = $2 WHERE student_id = $1',
        [student.id, input.isNew ?? true]
      );
      return student;
    };
    const line = (
      term: typeof firstFees,
      level: string,
      spec: Partial<Parameters<typeof createFeeLine>[2]> = {}
    ) =>
      createFeeLine(as, term, {
        level,
        name: `${level} fee`,
        amountMinor: TUITION,
        ...spec,
      });

    const chargedLater = await line(firstFees, 'P3');
    const wale = await admit({
      first: 'Wale',
      campusId: lekki.id,
      level: 'P3',
    });
    const [firstTerm, secondTerm] = await termInfos(app, owner);
    if (firstTerm === undefined || secondTerm === undefined) {
      throw new Error('The school offers two terms to charge');
    }
    expect([firstTerm.id, secondTerm.id]).toEqual([
      charge.firstTermId,
      charge.secondTermId,
    ]);

    await prepare(api, owner, {
      termId: charge.firstTermId,
      scope: 'campus',
      scopeId: lekki.id,
    });
    const cancelled = await prepare(api, owner, {
      termId: charge.firstTermId,
      scope: 'campus',
      scopeId: ikeja.id,
    });
    await api(owner)
      .post(`/billing-runs/${cancelled.runId}/cancel`)
      .expect(201);
    await prepare(api, owner, {
      termId: charge.secondTermId,
      scope: 'campus',
      scopeId: ikeja.id,
    });
    await api(owner).post(`/fee-lines/${chargedLater.id}/retire`).expect(201);

    await admit({
      first: 'Ada',
      last: 'Obi',
      campusId: lekki.id,
      level: 'JSS1',
    });
    await admit({
      first: 'Ada',
      last: 'Eze',
      campusId: ikeja.id,
      level: 'JSS1',
    });
    const withdrawn = await admit({
      first: 'Bola',
      campusId: lekki.id,
      level: 'JSS1',
    });
    await pool.query(
      `UPDATE student_enrollment SET status = 'withdrawn' WHERE student_id = $1`,
      [withdrawn.id]
    );
    const left = await admit({
      first: 'Chi',
      campusId: lekki.id,
      level: 'JSS1',
    });
    await api(owner)
      .post(`/students/${left.id}/leave`)
      .send({ reason: 'relocated', lastDay: '2026-10-01' })
      .expect(201);
    const awaySince = async (name: string, since: string) => {
      const student = await admit({
        first: name,
        campusId: lekki.id,
        level: 'JSS1',
      });
      await pool.query('UPDATE student SET not_seen_since = $2 WHERE id = $1', [
        student.id,
        since,
      ]);
    };
    await awaySince('Dan', '2026-08-01');
    await awaySince('Eve', '2026-10-01');
    await awaySince('Femi', INACTIVE_BOUNDARY);
    await awaySince('Gina', '2026-09-12');

    for (const term of [firstFees, secondFees]) {
      await line(term, 'JSS2', { campusId: lekki.id });
      await line(term, 'JSS3', { campusId: lekki.id });
      await line(term, 'JSS3');
      await line(term, 'SS1', { appliesTo: 'new' });
      await line(term, 'SS2', { appliesTo: 'returning' });
      await line(term, 'SS3', {
        feeType: 'School bus',
        name: 'Bus',
        isOptional: true,
      });
    }
    const retiredFirst = await line(firstFees, 'P1');
    const retiredSecond = await line(secondFees, 'P1');
    for (const retired of [retiredFirst, retiredSecond]) {
      await api(owner).post(`/fee-lines/${retired.id}/retire`).expect(201);
    }

    await admit({ first: 'Hauwa', campusId: lekki.id, level: 'JSS2' });
    await admit({ first: 'Ife', campusId: ikeja.id, level: 'JSS2' });
    const jide = await admit({
      first: 'Jide',
      campusId: ikeja.id,
      level: 'JSS2',
    });
    await api(owner)
      .post(`/students/${jide.id}/placements`)
      .send({
        termId: charge.secondTermId,
        classArmId: await armOf(lekki.id, 'JSS2'),
      })
      .expect(201);
    const kemi = await admit({
      first: 'Kemi',
      campusId: lekki.id,
      level: 'JSS2',
    });
    await pool.query('UPDATE student SET campus_id = $2 WHERE id = $1', [
      kemi.id,
      ikeja.id,
    ]);
    await admit({ first: 'Lara', campusId: lekki.id, level: 'JSS3' });
    await admit({ first: 'Musa', campusId: ikeja.id, level: 'JSS3' });
    await admit({ first: 'Nneka', campusId: lekki.id, level: 'SS1' });
    await admit({
      first: 'Obi',
      campusId: lekki.id,
      level: 'SS1',
      isNew: false,
    });
    await admit({ first: 'Pere', campusId: ikeja.id, level: 'SS2' });
    await admit({
      first: 'Queen',
      campusId: ikeja.id,
      level: 'SS2',
      isNew: false,
    });
    const rita = await admit({
      first: 'Rita',
      campusId: lekki.id,
      level: 'SS3',
    });
    await admit({ first: 'Sade', campusId: lekki.id, level: 'SS3' });
    await api(owner)
      .put(
        `/students/${rita.id}/fee-options/${fixture.feeTypeId('School bus')}`
      )
      .send({ optedIn: true })
      .expect(200);
    await admit({ first: 'Tade', campusId: lekki.id, level: 'P1' });
    await admit({ first: 'Uche', campusId: lekki.id, level: 'P2' });
    const vera = await admit({
      first: 'Vera',
      campusId: lekki.id,
      level: 'P2',
    });
    await addDiscount(pool, {
      organizationId: orgA.id,
      studentId: vera.id,
      fromTermId: charge.firstTermId,
    });

    const { rows: people } = await pool.query<{
      id: string;
      first_name: string;
      last_name: string;
    }>(
      'SELECT id, first_name, last_name FROM student WHERE organization_id = $1',
      [orgA.id]
    );
    const namesOf = new Map(
      people.map((row) => [
        row.id,
        { first: row.first_name, last: row.last_name },
      ])
    );
    expect(namesOf.get(wale.id)?.first).toBe('Wale');
    expect(namesOf.has(studentLekki.id)).toBe(true);
    expect(namesOf.has(studentIkeja.id)).toBe(true);

    const plans = app.get(BillingPlanService, { strict: false });
    const repo = app.get(BillingPlanRepository, { strict: false });
    const expectedCreated = {
      owner: { first: 12, second: 13 },
      bursar: { first: 8, second: 9 },
    };
    const expectedSkipped = {
      owner: { first: 2, second: 1 },
      bursar: { first: 2, second: 0 },
    };

    for (const [label, actor] of [
      ['owner', owner],
      ['bursar', lekkiOnly],
    ] as const) {
      const ctx = await orgContextFor(app, actor);
      for (const [which, term] of [
        ['first', firstTerm],
        ['second', secondTerm],
      ] as const) {
        const where = `${label} ${which} term`;
        const plan = await plans.plan(ctx, term, { scope: 'school' });
        const summary = await repo.chargeSummary(scopeOf(ctx), term, {
          today: plans.stamp(ctx).today,
          sampleSize: DASHBOARD_SAMPLE_SIZE,
        });

        expect(summary.created, where).toBe(plan.counts.created);
        expect(summary.skipped, where).toBe(plan.counts.skipped);
        expect(summary.levelIds, where).toEqual(
          await levelIdsOn(pool, ctx, term)
        );
        expect(summary.levelIds, where).toEqual(summary.levelIds.toSorted(cmp));
        expect(plan.counts.created, where).toBe(expectedCreated[label][which]);
        expect(plan.counts.skipped, where).toBe(expectedSkipped[label][which]);

        const expectedSample = plan.charges
          .map((planned) => ({
            id: planned.studentId,
            name: planned.name,
            ...(namesOf.get(planned.studentId) ?? { first: '', last: '' }),
          }))
          .toSorted(byFirstLastId)
          .slice(0, DASHBOARD_SAMPLE_SIZE);
        expect(summary.sample, where).toEqual(
          expectedSample.map(({ id, name }) => ({ id, name }))
        );
        expect(summary.sample.length, where).toBe(DASHBOARD_SAMPLE_SIZE);
      }
    }

    const ctx = await orgContextFor(app, owner);
    const none = await repo.chargeSummary(scopeOf(ctx), firstTerm, {
      today: TODAY,
      sampleSize: 0,
    });
    expect(none.sample).toEqual([]);
    expect(none.created).toBe(expectedCreated.owner.first);
  });
});
