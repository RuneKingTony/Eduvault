import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

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
  async record(db: Kysely<DB>, input: ActivityInput): Promise<void> {
    const data = input.data ?? {};
    const secret = secretKeyIn(data);
    if (secret !== undefined) {
      throw new Error(`Activity data must not hold a secret: ${secret}`);
    }
    await db
      .insertInto('activity_event')
      .values({
        organization_id: input.organizationId,
        campus_id: input.campusId,
        pillar: input.pillar,
        kind: input.kind,
        actor_user_id: input.actorUserId,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        text: input.text,
        data: JSON.stringify(data),
      })
      .execute();
  }
}
