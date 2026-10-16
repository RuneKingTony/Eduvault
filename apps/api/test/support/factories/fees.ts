import type { INestApplication } from '@nestjs/common';
import type {
  CalendarCurrent,
  ClassLevel,
  CreateFeeLineInput,
  FeeLine,
  FeeType,
} from '@eduvault/api-contract';
import { FeeLineService } from '../../../src/app/modules/fee-line/fee-line.service';
import type { Fixtures } from '../base-test';
import { orgContextFor } from './org-context';
import { ensureCurrentTerm } from './students';

type Api = Fixtures['api'];
interface Actor {
  cookie: string;
}

interface FeeFixture {
  termId: string;
  sessionId: string;
  levelId: (code: string) => string;
  feeTypeId: (name: string) => string;
}

export async function feeFixture(
  app: INestApplication,
  api: Api,
  actor: Actor
): Promise<FeeFixture> {
  await ensureCurrentTerm(app, actor);
  const [current, levels, types] = await Promise.all([
    api(actor).get('/calendar/current').expect(200),
    api(actor).get('/class-levels').expect(200),
    api(actor).get('/fee-types').expect(200),
  ]);
  const { term, schoolYear } = current.body as CalendarCurrent;
  return {
    termId: term?.id ?? '',
    sessionId: schoolYear?.id ?? '',
    levelId: (code) =>
      lookup(levels.body as ClassLevel[], (row) => row.code, code).id,
    feeTypeId: (name) =>
      lookup(types.body as FeeType[], (row) => row.name, name).id,
  };
}

function lookup<T>(rows: T[], key: (row: T) => string, wanted: string): T {
  const row = rows.find((candidate) => key(candidate) === wanted);
  if (row === undefined) {
    throw new Error(`No ${wanted}`);
  }
  return row;
}

type FeeLineSpec = Partial<CreateFeeLineInput> & {
  amountMinor: number;
  name: string;
};

export async function createFeeLine(
  as: { app: INestApplication; actor: Actor },
  fixture: FeeFixture,
  spec: FeeLineSpec & {
    level?: string;
    classLevelId?: string;
    feeType?: string;
  }
): Promise<FeeLine> {
  const { level = 'JSS2', classLevelId, feeType = 'Tuition', ...rest } = spec;
  const ctx = await orgContextFor(as.app, as.actor);
  return as.app.get(FeeLineService, { strict: false }).create(ctx, {
    termId: fixture.termId,
    classLevelId: classLevelId ?? fixture.levelId(level),
    feeTypeId: fixture.feeTypeId(feeType),
    campusId: null,
    ...rest,
  });
}
