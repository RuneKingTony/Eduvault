import type { INestApplication } from '@nestjs/common';
import type {
  CreatedSchoolYear,
  CreateSchoolYearInput,
} from '@eduvault/api-contract';
import { CalendarService } from '../../../src/app/modules/calendar/calendar.service';
import { orgContextFor } from './org-context';

export const YEAR_2026: CreateSchoolYearInput = {
  name: '2026/2027',
  startsOn: '2026-09-07',
  endsOn: '2027-07-23',
};

export const YEAR_2027: CreateSchoolYearInput = {
  name: '2027/2028',
  startsOn: '2027-09-06',
  endsOn: '2028-07-28',
};

export async function createSchoolYear(
  app: INestApplication,
  actor: { cookie: string },
  input: CreateSchoolYearInput = YEAR_2026
): Promise<CreatedSchoolYear> {
  const ctx = await orgContextFor(app, actor);
  return app.get(CalendarService, { strict: false }).create(ctx, input);
}
