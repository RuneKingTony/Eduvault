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

const run = async (input: ActivityInput) => {
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
  await new ActivityWriter().record(db, input);
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
