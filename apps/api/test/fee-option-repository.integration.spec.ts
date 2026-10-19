import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { FakeFeeOptionRepository } from '../src/app/modules/fee-line/fake-fee-line.repository';
import { FeeOptionRepository } from '../src/app/modules/fee-line/fee-line.repository';
import {
  describeFeeOptionRepositoryContract,
  optionChange,
  type FeeOptionHarness,
} from './fee-option-repository.contract';
import { expect, type Fixtures } from './support/base-test';
import { feeFixture } from './support/factories/fees';
import { schoolsTest as test, twoSchools } from './support/two-schools';

const fakeHarness = (): FeeOptionHarness => {
  const repository = new FakeFeeOptionRepository();
  return {
    repository,
    organizationId: 'school-a',
    userId: 'user-1',
    feeTypeId: 'bus',
    students: [
      { studentId: 'ada', enrollmentId: 'enrol-1' },
      { studentId: 'bea', enrollmentId: 'enrol-2' },
    ],
    recordedKinds: () =>
      Promise.resolve(repository.recorded.map((row) => row.kind)),
  };
};

describe('FakeFeeOptionRepository', () => {
  describeFeeOptionRepositoryContract((title, runScenario) => {
    it(title, async () => {
      await runScenario(fakeHarness());
    });
  });
});

describe('the fee option repository contract', () => {
  it('gives every scenario its own title, so none is hidden behind another', () => {
    const titles: string[] = [];
    describeFeeOptionRepositoryContract((title) => titles.push(title));

    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

const enrollmentOf = async (pool: Pool, studentId: string): Promise<string> => {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM student_enrollment WHERE student_id = $1',
    [studentId]
  );
  const [row] = rows;
  if (row === undefined) {
    throw new Error('The student has no enrolment');
  }
  return row.id;
};

const recordedKinds = async (
  pool: Pool,
  organizationId: string
): Promise<string[]> =>
  (
    await pool.query<{ kind: string }>(
      `SELECT kind FROM activity_event
       WHERE organization_id = $1 AND kind LIKE 'fee_option.%'
       ORDER BY occurred_at, id`,
      [organizationId]
    )
  ).rows.map((row) => row.kind);

const postgresHarness = async ({
  app,
  api,
  pool,
  schools,
}: Pick<Fixtures, 'app' | 'api' | 'pool'> & {
  schools: Awaited<ReturnType<typeof twoSchools>>;
}): Promise<FeeOptionHarness> => {
  const fixture = await feeFixture(app, api, schools.owner);
  return {
    repository: app.get(FeeOptionRepository),
    organizationId: schools.orgA.id,
    userId: schools.owner.id,
    feeTypeId: fixture.feeTypeId('School bus'),
    students: [
      {
        studentId: schools.studentLekki.id,
        enrollmentId: await enrollmentOf(pool, schools.studentLekki.id),
      },
      {
        studentId: schools.studentIkeja.id,
        enrollmentId: await enrollmentOf(pool, schools.studentIkeja.id),
      },
    ],
    recordedKinds: () => recordedKinds(pool, schools.orgA.id),
  };
};

test.describe('KyselyFeeOptionRepository', () => {
  describeFeeOptionRepositoryContract((title, runScenario) => {
    test(title, async ({ app, api, pool, schools }) => {
      await runScenario(await postgresHarness({ app, api, pool, schools }));
    });
  });

  test('saves no opt-in of a batch when one change fails', async ({
    app,
    api,
    pool,
    schools,
  }) => {
    const harness = await postgresHarness({ app, api, pool, schools });
    const good = optionChange(harness, 0, true);
    const bad = optionChange(harness, 1, true);

    await expect(
      harness.repository.setOptions([
        good,
        { ...bad, change: { ...bad.change, enrollmentId: randomUUID() } },
      ])
    ).rejects.toThrow();

    expect(
      await harness.repository.optedInFeeTypeIds(
        harness.organizationId,
        good.change.enrollmentId
      )
    ).toEqual([]);
    expect(await harness.recordedKinds()).toEqual([]);
  });
});
