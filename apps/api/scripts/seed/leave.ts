import type { INestApplicationContext } from '@nestjs/common';
import type { CreateLeaveInput } from '@eduvault/api-contract';
import { addDays, isWeekend } from '@eduvault/shared';
import type { OrgContext } from '../../src/app/common/auth';
import { CalendarService } from '../../src/app/modules/calendar/calendar.service';
import { LeaveService } from '../../src/app/modules/leave/leave.service';
import { orgContextFor } from './actors';
import { emailOf } from './members';

interface LeaveSeed {
  owner: OrgContext;
  today: string;
}

function schoolDayFrom(date: string, holidays: ReadonlySet<string>): string {
  let day = date;
  while (isWeekend(day) || holidays.has(day)) {
    day = addDays(day, 1);
  }
  return day;
}

async function askAs(
  app: INestApplicationContext,
  persona: string,
  input: CreateLeaveInput
) {
  const ctx = await orgContextFor(app, emailOf(persona));
  return app.get(LeaveService, { strict: false }).create(ctx, input);
}

export async function seedLeave(
  app: INestApplicationContext,
  { owner, today }: LeaveSeed
) {
  const leave = app.get(LeaveService, { strict: false });
  const holidays = new Set(
    await app
      .get(CalendarService, { strict: false })
      .holidayDates(owner.organizationId)
  );
  const day = (offset: number) =>
    schoolDayFrom(addDays(today, offset), holidays);
  await askAs(app, 'ayo', {
    type: 'sick',
    startsOn: day(5),
    endsOn: schoolDayFrom(addDays(day(5), 1), holidays),
    reason: 'Doctor’s appointment and a few days of rest',
  });
  await askAs(app, 'emeka', {
    type: 'maternity',
    startsOn: day(13),
    reason: 'Family matter',
  });
  const away = await askAs(app, 'emeka', {
    type: 'sick',
    startsOn: day(0),
    endsOn: schoolDayFrom(addDays(day(0), 1), holidays),
    reason: 'Malaria',
  });
  await leave.approve(owner, away.id);
  const study = await askAs(app, 'claire', {
    type: 'bereavement',
    startsOn: day(14),
    reason: 'Sitting a teaching exam',
    cover: 'Ayo Bassey will take French',
  });
  await leave.decline(
    owner,
    study.id,
    'Mock exams that week. Please pick another day.'
  );
}
