import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import { FEE_SCHEDULE_KINDS } from './fee-schedule-kinds';

export type ActivityPillar = 'foundation' | 'finance' | 'access' | 'platform';

export interface ActivityInput {
  organizationId: string;
  campusId: string | null;
  pillar: ActivityPillar;
  kind: string;
  actorUserId: string;
  subjectType: string;
  subjectId: string;
  text: string;
  data?: Record<string, unknown>;
}

export interface ActivityRecorder {
  recordMany(inputs: readonly ActivityInput[]): Promise<void>;
}

const SCHOOL_WIDE_FINANCE_KINDS: ReadonlySet<string> = new Set(
  Object.values(FEE_SCHEDULE_KINDS)
);

const SECRET_KEY = /pass(?:word|wd)|secret|token/i;

function secretKeyIn(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      return key;
    }
    const nested = secretKeyIn(child);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

@Injectable()
export class ActivityWriter {
  within(db: Kysely<DB>): ActivityRecorder {
    return {
      recordMany: (inputs) => this.recordMany(db, inputs),
    };
  }

  record(db: Kysely<DB>, input: ActivityInput): Promise<void> {
    return this.recordMany(db, [input]);
  }

  async recordMany(
    db: Kysely<DB>,
    inputs: readonly ActivityInput[]
  ): Promise<void> {
    if (inputs.length === 0) {
      return;
    }
    const values = inputs.map((input) => {
      const data = input.data ?? {};
      const secret = secretKeyIn(data);
      if (secret !== undefined) {
        throw new Error(`Activity data must not hold a secret: ${secret}`);
      }
      if (
        input.pillar === 'finance' &&
        input.campusId === null &&
        !SCHOOL_WIDE_FINANCE_KINDS.has(input.kind)
      ) {
        throw new Error('A finance activity row needs a campus');
      }
      return {
        organization_id: input.organizationId,
        campus_id: input.campusId,
        pillar: input.pillar,
        kind: input.kind,
        actor_user_id: input.actorUserId,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        text: input.text,
        data: JSON.stringify(data),
      };
    });
    await db.insertInto('activity_event').values(values).execute();
  }
}
