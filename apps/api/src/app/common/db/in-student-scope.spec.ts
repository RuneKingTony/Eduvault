import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import type { DB } from '../../../db/db-types';
import { inStudentScope } from './in-student-scope';

const db = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const compile = (scope: readonly string[]) =>
  db
    .selectFrom('student')
    .select('id')
    .where((eb) => inStudentScope(eb, 'student.id', scope))
    .compile();

describe('inStudentScope', () => {
  it('keeps only the listed students', () => {
    const query = compile(['a', 'b']);
    expect(query.sql).toContain('"student"."id" in ($1, $2)');
    expect(query.parameters).toEqual(['a', 'b']);
  });

  it('keeps nothing for an empty scope', () => {
    const query = compile([]);
    expect(query.sql).not.toContain(' in ');
    expect(query.parameters).toEqual([false]);
  });
});
