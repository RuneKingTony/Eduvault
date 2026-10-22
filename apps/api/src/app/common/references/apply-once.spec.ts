import { ConflictException } from '@nestjs/common';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import type { DB } from '../../../db/db-types';
import { claimReference, replayOf } from './apply-once';

const recordingDb = () => {
  const statements: string[] = [];
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      statements.push(event.query.sql);
    },
  });
  return { db, statements };
};

const existing = { id: 'row-1', requestHash: 'hash-a' };

describe('claimReference', () => {
  it('takes the lock for the key before it looks the reference up', async () => {
    const { db, statements } = recordingDb();
    const find = vi.fn(() => {
      expect(statements).toHaveLength(1);
      expect(statements[0]).toContain('pg_advisory_xact_lock');
      return Promise.resolve(undefined);
    });

    await claimReference(db, { lockKey: 'k', requestHash: 'hash-a', find });

    expect(find).toHaveBeenCalledOnce();
  });

  it('is first when nothing used the reference', async () => {
    const { db } = recordingDb();

    await expect(
      claimReference(db, {
        lockKey: 'k',
        requestHash: 'hash-a',
        find: () => Promise.resolve(undefined),
      })
    ).resolves.toEqual({ status: 'first' });
  });

  it('is a replay for the same request and a clash for another', async () => {
    const { db } = recordingDb();
    const find = () => Promise.resolve(existing);

    await expect(
      claimReference(db, { lockKey: 'k', requestHash: 'hash-a', find })
    ).resolves.toEqual({ status: 'replayed', existing });
    await expect(
      claimReference(db, { lockKey: 'k', requestHash: 'hash-b', find })
    ).resolves.toEqual({ status: 'clash', existing });
  });
});

const taken = () => new ConflictException('taken');
const used = () => new ConflictException('used');

describe('replayOf', () => {
  it('answers taken for a row the caller cannot see, before it compares', () => {
    const sameRequest = vi.fn(() => true);

    expect(() =>
      replayOf({ visible: undefined, sameRequest, taken, used })
    ).toThrow('taken');
    expect(sameRequest).not.toHaveBeenCalled();
  });

  it('answers used for another request on a visible row', () => {
    expect(() =>
      replayOf({
        visible: { id: 'row-1' },
        sameRequest: () => false,
        taken,
        used,
      })
    ).toThrow('used');
  });

  it('returns the visible row for the same request', () => {
    expect(
      replayOf({
        visible: { id: 'row-1' },
        sameRequest: () => true,
        taken,
        used,
      })
    ).toEqual({ id: 'row-1' });
  });
});
