import type { OrgContext } from '../../../src/app/common/auth';
import { LeaveService } from '../../../src/app/modules/leave/leave.service';
import {
  mustFind,
  moveClock,
  staffContext,
  type DemoRun,
  type SchoolFacts,
} from './demo-run';
import { oldestFirst } from './ordering';
import type { LeavePlan } from './school-life-plan';

interface LeaveRun {
  run: DemoRun;
  leave: LeaveService;
  owner: OrgContext;
  principal: OrgContext;
}

/** A request cannot start before today, so each one is made on its own earlier day and then decided later. */
async function runRequest(
  context: LeaveRun,
  request: LeavePlan
): Promise<void> {
  const { run, leave } = context;
  const requester = await staffContext(
    run,
    mustFind(run.plan.teachers[request.teacher], `teacher ${request.teacher}`)
      .key
  );
  moveClock(run, request.createdDaysAgo);
  const created = await leave.create(requester, {
    type: request.type,
    startsOn: request.startsOn,
    endsOn: request.endsOn,
    reason: request.reason,
    cover: request.cover ?? undefined,
  });
  if (request.decidedDaysAgo === null) {
    return;
  }
  moveClock(run, request.decidedDaysAgo);
  const decider =
    request.decider === 'owner' ? context.owner : context.principal;
  const reason = (): string => mustFind(request.note, 'leave note');
  switch (request.outcome) {
    case 'withdrawn': {
      await leave.withdraw(requester, created.id);
      break;
    }
    case 'declined': {
      await leave.decline(decider, created.id, reason());
      break;
    }
    case 'cancelled': {
      await leave.approve(decider, created.id);
      moveClock(run, mustFind(request.cancelledDaysAgo, 'cancel day'));
      await leave.cancel(decider, created.id, reason());
      break;
    }
    case 'approved': {
      await leave.approve(decider, created.id);
      break;
    }
    case 'pending': {
      break;
    }
  }
}

export async function runLeave(
  run: DemoRun,
  school: SchoolFacts
): Promise<void> {
  const context: LeaveRun = {
    run,
    leave: run.app.get(LeaveService, { strict: false }),
    owner: school.owner,
    principal: await staffContext(run, 'principal'),
  };
  for (const request of oldestFirst(
    run.plan.leave,
    (row) => row.createdDaysAgo
  )) {
    await runRequest(context, request);
  }
}
