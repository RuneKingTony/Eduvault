import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LEAVE_CANCEL_NOT_APPROVED_MESSAGE,
  LEAVE_CANCEL_STARTED_MESSAGE,
  LEAVE_NOT_FOUND_MESSAGE,
  LEAVE_NO_SCHOOL_DAY_MESSAGE,
  LEAVE_OVERLAP_MESSAGE,
  LEAVE_PAST_START_MESSAGE,
  LEAVE_STAFF_ONLY_MESSAGE,
  LEAVE_WITHDRAW_MESSAGE,
  type CreateLeaveInput,
  type LeaveDto,
  type LeaveListQuery,
  type LeaveSeen,
  type MarkLeaveSeenInput,
  type MyLeave,
} from '@eduvault/api-contract';
import {
  daysTakenThisYear,
  lagosDateOf,
  fmtDateRange,
  leaveCancelBlock,
  leaveTypeLower,
  nextTimeOff,
  schoolDays,
} from '@eduvault/shared';
import { assertDeclineReason, decide } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { CalendarService } from '../calendar/calendar.service';
import {
  LeaveRepository,
  type LeaveEntry,
  type LeaveTx,
  type LockedLeave,
  type UnseenDecisions,
} from './leave.repository';
import { orgScopeOf } from '../../common/scope';

const HOLIDAY_CARD_SIZE = 20;

const notFound = () => new NotFoundException(LEAVE_NOT_FOUND_MESSAGE);

const toDto = <Entry extends LeaveEntry>(
  entry: Entry,
  holidays: readonly string[]
): Entry & { days: number } => ({
  ...entry,
  days: schoolDays(entry.startsOn, entry.endsOn, holidays),
});

const sentenceFor = (found: LockedLeave): string =>
  `${found.requesterName}’s ${leaveTypeLower(found.type)} (${fmtDateRange(found.startsOn, found.endsOn)})`;

function assertCancellable(found: LockedLeave, today: string): void {
  const block = leaveCancelBlock(found, today);
  if (block === 'notApproved') {
    throw new ConflictException(LEAVE_CANCEL_NOT_APPROVED_MESSAGE);
  }
  if (block === 'started') {
    throw new ConflictException(LEAVE_CANCEL_STARTED_MESSAGE);
  }
}

function assertNotActing(ctx: OrgContext): void {
  if (ctx.acting !== null) {
    throw new ForbiddenException(LEAVE_STAFF_ONLY_MESSAGE);
  }
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly leave: LeaveRepository,
    private readonly calendar: CalendarService,
    private readonly clock: Clock
  ) {}

  async mine(ctx: OrgContext): Promise<MyLeave> {
    const today = this.clock.today();
    const [entries, holidays, current, otherApproverExists, daysOff, unseen] =
      await Promise.all([
        this.leave.mine(ctx.organizationId, ctx.user.id),
        this.calendar.holidayDates(ctx.organizationId),
        this.calendar.current(ctx),
        this.leave.otherApproverExists(ctx.organizationId, ctx.user.id),
        this.calendar.daysOff(ctx, HOLIDAY_CARD_SIZE),
        this.leave.unseenDecisions(ctx.organizationId, ctx.user.id),
      ]);
    const items = entries.map((entry) => toDto(entry, holidays));
    const waiting = items.filter((item) => item.status === 'submitted');
    const oldest = waiting
      .map((item) => item.createdAt)
      .toSorted((a, b) => a.localeCompare(b))[0];
    return {
      items,
      daysTakenThisYear:
        current.schoolYear === null
          ? 0
          : daysTakenThisYear(items, current.schoolYear.startsOn),
      waiting: waiting.length,
      oldestWaitingSentOn: oldest === undefined ? null : lagosDateOf(oldest),
      nextTimeOff: nextTimeOff(items, today),
      otherApproverExists,
      schoolYearLabel: current.schoolYear?.name ?? null,
      holidays: daysOff,
      unseenDecisions: unseen.items.map((entry) => toDto(entry, holidays)),
      unseenCount: unseen.count,
    };
  }

  unseenDecisions(ctx: OrgContext): Promise<UnseenDecisions> {
    return this.leave.unseenDecisions(ctx.organizationId, ctx.user.id);
  }

  async markSeen(
    ctx: OrgContext,
    input: MarkLeaveSeenInput
  ): Promise<LeaveSeen> {
    assertNotActing(ctx);
    const at = new Date(
      Math.min(new Date(input.through).getTime(), Date.now())
    );
    await this.leave.markSeen(ctx.organizationId, ctx.user.id, at);
    return { seenAt: at.toISOString() };
  }

  async list(ctx: OrgContext, query: LeaveListQuery): Promise<LeaveDto[]> {
    const [entries, holidays] = await Promise.all([
      this.leave.list(orgScopeOf(ctx), ctx.user.id, query),
      this.calendar.holidayDates(ctx.organizationId),
    ]);
    return entries.map((entry) => toDto(entry, holidays));
  }

  async create(ctx: OrgContext, input: CreateLeaveInput): Promise<LeaveDto> {
    assertNotActing(ctx);
    const endsOn = input.endsOn ?? input.startsOn;
    if (input.startsOn < this.clock.today()) {
      throw new BadRequestException(LEAVE_PAST_START_MESSAGE);
    }
    const holidays = await this.calendar.holidayDates(ctx.organizationId);
    if (schoolDays(input.startsOn, endsOn, holidays) === 0) {
      throw new BadRequestException(LEAVE_NO_SCHOOL_DAY_MESSAGE);
    }
    const id = await this.leave.withTx(
      orgScopeOf(ctx),
      ctx.user.id,
      async (tx) => {
        if (await tx.hasOverlap(input.startsOn, endsOn)) {
          throw new ConflictException(LEAVE_OVERLAP_MESSAGE);
        }
        const created = await tx.insert({
          type: input.type,
          startsOn: input.startsOn,
          endsOn,
          reason: input.reason,
          cover:
            input.cover === undefined || input.cover === ''
              ? null
              : input.cover,
        });
        await tx.record({
          organizationId: ctx.organizationId,
          campusId: null,
          pillar: 'foundation',
          kind: 'leave.requested',
          actorUserId: ctx.user.id,
          subjectType: 'staff_leave',
          subjectId: created,
          text: `${ctx.user.name} asked for ${leaveTypeLower(input.type)}: ${fmtDateRange(input.startsOn, endsOn)}.`,
          data: { type: input.type },
        });
        return created;
      }
    );
    return this.item(ctx, id);
  }

  async withdraw(ctx: OrgContext, id: string): Promise<LeaveDto> {
    assertNotActing(ctx);
    await this.leave.withTx(orgScopeOf(ctx), ctx.user.id, async (tx) => {
      const found = await tx.lockOwn(id);
      if (found === undefined) {
        throw notFound();
      }
      if (found.status !== 'submitted' || !(await tx.withdraw(id))) {
        throw new ConflictException(LEAVE_WITHDRAW_MESSAGE);
      }
    });
    return this.item(ctx, id);
  }

  async approve(ctx: OrgContext, id: string): Promise<LeaveDto> {
    await this.decideOn(ctx, id, async (tx, found, ownRequest) => {
      const applied = await tx.approve(id);
      if (applied) {
        await this.recordDecision(tx, ctx, {
          found,
          kind: 'leave.approved',
          text: `${sentenceFor(found)} was approved${ownRequest ? ' (their own request)' : ''}.`,
        });
      }
      return applied;
    });
    return this.item(ctx, id);
  }

  async decline(
    ctx: OrgContext,
    id: string,
    reason: string
  ): Promise<LeaveDto> {
    const declineReason = assertDeclineReason(reason);
    await this.decideOn(ctx, id, async (tx, found) => {
      const applied = await tx.reject(id, declineReason);
      if (applied) {
        await this.recordDecision(tx, ctx, {
          found,
          kind: 'leave.declined',
          text: `A request was declined: ${declineReason}`,
        });
      }
      return applied;
    });
    return this.item(ctx, id);
  }

  async cancel(ctx: OrgContext, id: string, reason: string): Promise<LeaveDto> {
    const cancelReason = assertDeclineReason(reason);
    const today = this.clock.today();
    await this.leave.withTx(orgScopeOf(ctx), ctx.user.id, async (tx) => {
      const found = await tx.lockInScope(id);
      if (found === undefined) {
        throw notFound();
      }
      await decide(
        {
          actorId: ctx.user.id,
          createdBy: found.createdBy,
          isOwner: ctx.isOwner,
        },
        async () => {
          assertCancellable(found, today);
          const applied = await tx.cancel(id, cancelReason);
          if (applied) {
            await this.recordDecision(tx, ctx, {
              found,
              kind: 'leave.cancelled',
              text: `${sentenceFor(found)} was cancelled.`,
            });
          }
          return applied;
        }
      );
    });
    return this.item(ctx, id);
  }

  private decideOn(
    ctx: OrgContext,
    id: string,
    apply: (
      tx: LeaveTx,
      found: LockedLeave,
      ownRequest: boolean
    ) => Promise<boolean>
  ): Promise<void> {
    return this.leave.withTx(orgScopeOf(ctx), ctx.user.id, async (tx) => {
      const found = await tx.lockInScope(id);
      if (found === undefined) {
        throw notFound();
      }
      await decide(
        {
          actorId: ctx.user.id,
          createdBy: found.createdBy,
          isOwner: ctx.isOwner,
        },
        async (ownRequest) =>
          found.status === 'submitted' && (await apply(tx, found, ownRequest))
      );
    });
  }

  private recordDecision(
    tx: LeaveTx,
    ctx: OrgContext,
    event: { found: LockedLeave; kind: string; text: string }
  ): Promise<void> {
    return tx.record({
      organizationId: ctx.organizationId,
      campusId: null,
      pillar: 'foundation',
      kind: event.kind,
      actorUserId: ctx.user.id,
      subjectType: 'staff_leave',
      subjectId: event.found.id,
      text: event.text,
      data: { type: event.found.type },
    });
  }

  private async item(ctx: OrgContext, id: string): Promise<LeaveDto> {
    const [entry, holidays] = await Promise.all([
      this.leave.find(ctx.organizationId, ctx.user.id, id),
      this.calendar.holidayDates(ctx.organizationId),
    ]);
    if (entry === undefined) {
      throw notFound();
    }
    return toDto(entry, holidays);
  }
}
