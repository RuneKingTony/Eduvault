import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import type { DB } from '../../../db/db-types';
import { inCampusScope, type InCampusScopeOptions } from './in-campus-scope';

const db = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const compile = (options: InCampusScopeOptions) =>
  db
    .selectFrom('fee_schedule')
    .select('id')
    .where((eb) => inCampusScope(eb, 'fee_schedule.campus_id', options))
    .compile();

describe('inCampusScope', () => {
  it('keeps every row for the school-wide scope', () => {
    const query = compile({ scope: 'all' });
    expect(query.sql).not.toContain('campus_id');
    expect(query.parameters).toEqual([true]);
  });

  it('keeps only rows on the listed campuses', () => {
    const query = compile({ scope: ['a', 'b'] });
    expect(query.sql).toContain('"fee_schedule"."campus_id" in ($1, $2)');
    expect(query.parameters).toEqual(['a', 'b']);
  });

  it('keeps nothing for an empty scope', () => {
    expect(compile({ scope: [] }).parameters).toEqual([false]);
  });

  it('hides null-campus rows from a campus scope by default', () => {
    expect(compile({ scope: ['a'] }).sql).not.toContain('is null');
    expect(
      compile({ scope: ['a'], nullMeans: 'readAllOnly' }).sql
    ).not.toContain('is null');
  });

  it('shows null-campus rows to a campus scope when null means all', () => {
    const query = compile({ scope: ['a'], nullMeans: 'all' });
    expect(query.sql).toContain('"fee_schedule"."campus_id" is null');
    expect(query.sql).toContain('"fee_schedule"."campus_id" in ($1)');
  });

  it('shows null-campus rows to an empty scope when null means all', () => {
    const query = compile({ scope: [], nullMeans: 'all' });
    expect(query.sql).toContain('"fee_schedule"."campus_id" is null');
    expect(query.parameters).toEqual([false]);
  });
});
