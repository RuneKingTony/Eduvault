import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLASS_NOT_FOUND_MESSAGE,
  LEAVE_NO_CURRENT_TERM_MESSAGE,
  leavingReasonLabel,
  MOVE_NOT_NEXT_TERM_MESSAGE,
  MOVE_NO_ENROLMENT_MESSAGE,
  MOVE_NO_NEXT_TERM_MESSAGE,
  alreadyMarkedMessage,
  archivedClassMessage,
  chooseLevelClassMessage,
  moveHasPlacementMessage,
  studentGoneMessage,
  studentNotMarkedMessage,
  studentOnRollMessage,
  undoWindowMessage,
  type LeaveInput,
  type MarkAwayInput,
  type PlaceStudentInput,
  type PlacementClass,
  type StudentDetail,
} from '@eduvault/api-contract';
import { fmtDate, inactiveFrom, isInactiveByAbsence } from '@eduvault/shared';
import type { OrgContext } from '../../common/auth';
import { Clock, schoolToday } from '../../common/clock';
import { canUndoLeaving, leaveDateError, markAwayDateError } from './lifecycle';
import type { CurrentTerm } from './admission.repository';
import type {
  EnrolmentFacts,
  LifecycleStudent,
  LifecycleTx,
  PlacementArm,
} from './lifecycle.repository';
import { LifecycleRunner } from './lifecycle-runner';

const fullName = (student: Pick<LifecycleStudent, 'firstName' | 'lastName'>) =>
  `${student.firstName} ${student.lastName}`;

const noteOf = (note: string | undefined): string | null =>
  note === undefined || note === '' ? null : note;

function recordFor(
  {
    tx,
    ctx,
    student,
  }: { tx: LifecycleTx; ctx: OrgContext; student: LifecycleStudent },
  event: { kind: string; text: string; data: Record<string, unknown> }
): Promise<void> {
  return tx.record({
    organizationId: ctx.organizationId,
    campusId: student.campusId,
    pillar: 'foundation',
    actorUserId: ctx.user.id,
    subjectType: 'student',
    subjectId: student.id,
    ...event,
  });
}
interface PlacementTarget {
  term: CurrentTerm;
  next: { id: string; name: string };
  enrolment: EnrolmentFacts;
  arm: PlacementArm;
}

function requireOnRoll(student: LifecycleStudent): void {
  if (student.exitKind !== null) {
    throw new ConflictException(studentGoneMessage(fullName(student)));
  }
}

@Injectable()
export class LifecycleService {
  constructor(
    private readonly runner: LifecycleRunner,
    private readonly clock: Clock
  ) {}

  markAway(
    ctx: OrgContext,
    id: string,
    input: MarkAwayInput
  ): Promise<StudentDetail> {
    const today = schoolToday(ctx, this.clock);
    return this.runner.run(ctx, id, async (tx, student) => {
      requireOnRoll(student);
      if (student.notSeenSince !== null) {
        throw new ConflictException(
          alreadyMarkedMessage(fmtDate(student.notSeenSince))
        );
      }
      const dateError = markAwayDateError({
        date: input.date,
        today,
        admittedOn: student.admittedOn,
      });
      if (dateError !== null) {
        throw new BadRequestException(dateError);
      }
      await tx.setNotSeen({
        organizationId: ctx.organizationId,
        studentId: student.id,
        date: input.date,
        byUserId: ctx.user.id,
        note: noteOf(input.note),
      });
      const outcome = isInactiveByAbsence(input.date, today)
        ? 'More than 5 weeks, so now Inactive.'
        : `Inactive from ${fmtDate(inactiveFrom(input.date))} if not back.`;
      await recordFor(
        { tx, ctx, student },
        {
          kind: 'student.marked_away',
          text: `${fullName(student)} marked not seen since ${fmtDate(input.date)}. ${outcome}`,
          data: { date: input.date },
        }
      );
    });
  }

  backInSchool(ctx: OrgContext, id: string): Promise<StudentDetail> {
    const today = schoolToday(ctx, this.clock);
    return this.runner.run(ctx, id, async (tx, student) => {
      requireOnRoll(student);
      if (student.notSeenSince === null) {
        throw new ConflictException(studentNotMarkedMessage(fullName(student)));
      }
      const wasInactive = isInactiveByAbsence(student.notSeenSince, today);
      await tx.clearNotSeen(ctx.organizationId, student.id);
      await recordFor(
        { tx, ctx, student },
        {
          kind: 'student.back_in_school',
          text: `${fullName(student)} is back in school${wasInactive ? ' and Active again' : ''}.`,
          data: { wasInactive },
        }
      );
    });
  }

  leave(
    ctx: OrgContext,
    id: string,
    input: LeaveInput
  ): Promise<StudentDetail> {
    const today = schoolToday(ctx, this.clock);
    return this.runner.run(ctx, id, async (tx, student) => {
      requireOnRoll(student);
      const dateError = leaveDateError(input.lastDay, today);
      if (dateError !== null) {
        throw new BadRequestException(dateError);
      }
      const term = await tx.currentTerm(ctx.organizationId);
      if (term === undefined) {
        throw new ConflictException(LEAVE_NO_CURRENT_TERM_MESSAGE);
      }
      await tx.recordLeaving({
        organizationId: ctx.organizationId,
        studentId: student.id,
        userId: student.userId,
        actorUserId: ctx.user.id,
        reason: input.reason,
        lastDay: input.lastDay,
        note: noteOf(input.note),
        sessionId: term.sessionId,
        termId: term.termId,
      });
      await recordFor(
        { tx, ctx, student },
        {
          kind: 'student.left',
          text: `${fullName(student)} recorded as left: ${leavingReasonLabel(input.reason)}.`,
          data: { reason: input.reason, lastDay: input.lastDay },
        }
      );
    });
  }

  undoLeaving(ctx: OrgContext, id: string): Promise<StudentDetail> {
    return this.runner.run(ctx, id, async (tx, student) => {
      if (student.exitKind === null) {
        throw new ConflictException(studentOnRollMessage(fullName(student)));
      }
      const term = await tx.currentTerm(ctx.organizationId);
      const allowed = canUndoLeaving({
        exitKind: student.exitKind,
        archivedTermId: student.archivedTermId,
        currentTermId: term?.termId ?? null,
      });
      if (!allowed) {
        throw new ConflictException(undoWindowMessage(student.exitKind));
      }
      await tx.undoArchive({
        organizationId: ctx.organizationId,
        studentId: student.id,
        userId: student.userId,
      });
      const word = student.exitKind === 'left' ? 'leaving' : 'graduation';
      await recordFor(
        { tx, ctx, student },
        {
          kind: 'student.undone',
          text: `${fullName(student)}’s ${word} was undone by ${ctx.user.name}.`,
          data: { was: student.exitKind },
        }
      );
    });
  }

  private async placementTarget(
    ctx: OrgContext,
    tx: LifecycleTx,
    request: { student: LifecycleStudent; input: PlaceStudentInput }
  ): Promise<PlacementTarget> {
    const { student, input } = request;
    const term = await tx.currentTerm(ctx.organizationId);
    const next =
      term === undefined
        ? undefined
        : await tx.nextTerm(ctx.organizationId, term.termId);
    if (term === undefined || next === undefined) {
      throw new ConflictException(MOVE_NO_NEXT_TERM_MESSAGE);
    }
    const enrolment = await tx.activeEnrolment(ctx.organizationId, {
      studentId: student.id,
      sessionId: term.sessionId,
    });
    if (enrolment === undefined) {
      throw new ConflictException(MOVE_NO_ENROLMENT_MESSAGE);
    }
    const placed = await tx.hasPlacement(ctx.organizationId, {
      enrolmentId: enrolment.id,
      termId: next.id,
    });
    if (placed) {
      throw new ConflictException(
        moveHasPlacementMessage(fullName(student), next.name)
      );
    }
    if (input.termId !== next.id) {
      throw new BadRequestException(MOVE_NOT_NEXT_TERM_MESSAGE);
    }
    const arm = await tx.findArm(ctx.organizationId, input.classArmId);
    if (arm === undefined) {
      throw new NotFoundException(CLASS_NOT_FOUND_MESSAGE);
    }
    if (arm.levelId !== enrolment.levelId) {
      throw new BadRequestException(
        chooseLevelClassMessage(enrolment.levelName)
      );
    }
    if (arm.retired) {
      throw new BadRequestException(archivedClassMessage(arm.display));
    }
    return { term, next, enrolment, arm };
  }

  async nextTermClasses(
    ctx: OrgContext,
    id: string
  ): Promise<PlacementClass[]> {
    const arms = await this.runner.read(ctx, id, async (tx) => {
      const term = await tx.currentTerm(ctx.organizationId);
      const enrolment =
        term === undefined
          ? undefined
          : await tx.activeEnrolment(ctx.organizationId, {
              studentId: id,
              sessionId: term.sessionId,
            });
      return enrolment === undefined
        ? []
        : tx.openArmsAtLevel(ctx.organizationId, enrolment.levelId);
    });
    return arms.map((arm) => ({
      id: arm.id,
      name: arm.display,
      campus: { id: arm.campusId, name: arm.campusName },
    }));
  }

  place(
    ctx: OrgContext,
    id: string,
    input: PlaceStudentInput
  ): Promise<StudentDetail> {
    return this.runner.run(ctx, id, async (tx, student) => {
      requireOnRoll(student);
      const { term, next, enrolment, arm } = await this.placementTarget(
        ctx,
        tx,
        { student, input }
      );
      await tx.insertPlacement({
        organizationId: ctx.organizationId,
        enrolmentId: enrolment.id,
        termId: next.id,
        arm,
        actorUserId: ctx.user.id,
      });
      await recordFor(
        { tx, ctx, student },
        {
          kind: 'student.placed',
          text: `${fullName(student)} will move to ${arm.display}, ${arm.campusName} from ${next.name}. ${term.termName} records keep the old class.`,
          data: { termId: next.id, classArmId: arm.id },
        }
      );
    });
  }
}
