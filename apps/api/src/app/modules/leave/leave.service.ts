import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LEAVE_NOT_FOUND_MESSAGE,
  LEAVE_NO_SCHOOL_DAY_MESSAGE,
  LEAVE_OVERLAP_MESSAGE,
  LEAVE_PAST_START_MESSAGE,
  LEAVE_STAFF_ONLY_MESSAGE,
  LEAVE_WITHDRAW_MESSAGE,
  type CreateLeaveInput,
  type LeaveDto,
  type LeaveListQuery,
  type MyLeave,
} from '@eduvault/api-contract';
import {
  daysTakenThisYear,
  lagosDateOf,
  fmtDateRange,
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
  type LeaveScope,
  type LeaveTx,
  type LockedLeave,
} from './leave.repository';

const HOLIDAY_CARD_SIZE = 20;

const scopeOf = (ctx: OrgContext): LeaveScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

const notFound = () => new NotFoundException(LEAVE_NOT_FOUND_MESSAGE);

const toDto = (entry: LeaveEntry, holidays: readonly string[]): LeaveDto => ({
  ...entry,
  days: schoolDays(entry.startsOn, entry.endsOn, holidays),
});

const sentenceFor = (found: LockedLeave): string =>
  `${found.requesterName}’s ${leaveTypeLower(found.type)} (${fmtDateRange(found.startsOn, found.endsOn)})`;

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
    const [entries, holidays, current, otherApproverExists, daysOff] =
      await Promise.all([
        this.leave.mine(ctx.organizationId, ctx.user.id),
        this.calendar.holidayDates(ctx.organizationId),
        this.calendar.current(ctx),
        this.leave.otherApproverExists(ctx.organizationId, ctx.user.id),
        this.calendar.daysOff(ctx, HOLIDAY_CARD_SIZE),
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
    };
  }

  async list(ctx: OrgContext, query: LeaveListQuery): Promise<LeaveDto[]> {
    const [entries, holidays] = await Promise.all([
      this.leave.list(scopeOf(ctx), ctx.user.id, query),
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
      scopeOf(ctx),
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
    await this.leave.withTx(scopeOf(ctx), ctx.user.id, async (tx) => {
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
    await this.decideOn(ctx, id, async (tx, found) => {
      const applied = await tx.approve(id);
      if (applied) {
        await this.recordDecision(tx, ctx, {
          found,
          kind: 'leave.approved',
          text: `${sentenceFor(found)} was approved.`,
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

  private decideOn(
    ctx: OrgContext,
    id: string,
    apply: (tx: LeaveTx, found: LockedLeave) => Promise<boolean>
  ): Promise<void> {
    return this.leave.withTx(scopeOf(ctx), ctx.user.id, async (tx) => {
      const found = await tx.lockInScope(id);
      if (found === undefined) {
        throw notFound();
      }
      await decide(
        { actorId: ctx.user.id, createdBy: found.createdBy },
        async () => found.status === 'submitted' && (await apply(tx, found))
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
