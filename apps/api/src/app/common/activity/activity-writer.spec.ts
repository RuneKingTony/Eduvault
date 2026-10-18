import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
} from 'kysely';
import type { DB } from '../../../db/db-types';
import { ActivityWriter, type ActivityInput } from './activity-writer';

const run = async (...inputs: ActivityInput[]) => {
  const compiled: CompiledQuery[] = [];
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      compiled.push(event.query);
    },
  });
  await new ActivityWriter().recordMany(db, inputs);
  return compiled;
};

const base: ActivityInput = {
  organizationId: 'org-1',
  campusId: 'campus-1',
  pillar: 'foundation',
  kind: 'student.admitted',
  actorUserId: 'user-1',
  subjectType: 'student',
  subjectId: 'student-1',
  text: 'Peace Udoh admitted (GF-0234).',
};

describe('ActivityWriter', () => {
  it('inserts several rows in one statement and none for an empty list', async () => {
    const compiled = await run(base, { ...base, subjectId: 'student-2' });
    expect(compiled).toHaveLength(1);
    expect(await run()).toEqual([]);
  });

  it('refuses a finance row without a campus', async () => {
    await expect(
      run({ ...base, pillar: 'finance', campusId: null })
    ).rejects.toThrow('A finance activity row needs a campus');
  });

  it('inserts one row with the data as JSON', async () => {
    const [query] = await run({
      ...base,
      data: { admissionNumber: 'GF-0234' },
    });
    expect(query?.sql).toContain('insert into "activity_event"');
    expect(query?.parameters).toContain('{"admissionNumber":"GF-0234"}');
    expect(query?.parameters).toContain('Peace Udoh admitted (GF-0234).');
  });

  it('stores empty data when none is given', async () => {
    const [query] = await run(base);
    expect(query?.parameters).toContain('{}');
  });

  it.each(['password', 'temporaryPassword', 'newPasswd', 'secret', 'token'])(
    'refuses a data key named %s, even nested',
    async (key) => {
      await expect(run({ ...base, data: { [key]: 'x' } })).rejects.toThrow(
        'must not hold a secret'
      );
      await expect(
        run({ ...base, data: { login: { [key]: 'x' } } })
      ).rejects.toThrow('must not hold a secret');
    }
  );
});
