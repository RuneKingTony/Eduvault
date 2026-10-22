import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GUARDIAN_NOT_FOUND_MESSAGE,
  GUARDIAN_PHOTO_INVALID_MESSAGE,
  GUARDIAN_SHARED_RESET_MESSAGE,
  GUARDIAN_STAFF_RESET_MESSAGE,
  STUDENT_NOT_FOUND_MESSAGE,
  type EditGuardianInput,
  type GuardianDetail,
  type GuardianDraft,
  type GuardianLink,
  type GuardianSummary,
  type GuardianUnlinked,
  type LinkGuardianResult,
  type LoginCredential,
  type ResetLogin,
  type UpdateGuardianLinkInput,
} from '@eduvault/api-contract';
import { splitRoles } from '@eduvault/policy';
import {
  AccountService,
  generateTemporaryPassword,
  requirePermission,
  type OrgContext,
} from '../../common/auth';
import { FilesService } from '../../common/files';
import {
  GUARDIAN_ROLE,
  assertRoomForLink,
  attachGuardian,
  changeLink,
  defaultPaysFees,
  provisionGuardian,
  removeLink,
  type GuardianTx,
  type LoginHolds,
  type StudentFacts,
} from '../../common/people';
import { GuardianRepository } from './guardian.repository';
import { campusClassScopeOf } from '../../common/scope';

const studentNotFound = () => new NotFoundException(STUDENT_NOT_FOUND_MESSAGE);
const guardianNotFound = () =>
  new NotFoundException(GUARDIAN_NOT_FOUND_MESSAGE);

const fullName = (student: StudentFacts): string =>
  `${student.firstName} ${student.lastName}`;

function assertResettable(holds: LoginHolds, organizationId: string): void {
  const here = holds.memberships.find(
    (member) => member.organizationId === organizationId
  );
  if (here?.roles.some((role) => role !== GUARDIAN_ROLE) === true) {
    throw new ConflictException(GUARDIAN_STAFF_RESET_MESSAGE);
  }
  const elsewhere = holds.memberships.some(
    (member) => member.organizationId !== organizationId
  );
  if (elsewhere || splitRoles(holds.platformRole).length > 0) {
    throw new ConflictException(GUARDIAN_SHARED_RESET_MESSAGE);
  }
}

interface LinkOutcome {
  guardianId: string;
  credential: LoginCredential | undefined;
}

@Injectable()
export class GuardianService {
  constructor(
    private readonly guardians: GuardianRepository,
    private readonly accounts: AccountService,
    private readonly files: FilesService
  ) {}

  async list(
    ctx: OrgContext,
    query: { q?: string; excludeStudentId?: string }
  ): Promise<GuardianSummary[]> {
    if (query.excludeStudentId !== undefined) {
      await this.visibleStudent(ctx, query.excludeStudentId);
    }
    return this.guardians.list(
      ctx.organizationId,
      campusClassScopeOf(ctx),
      query
    );
  }

  async get(ctx: OrgContext, id: string): Promise<GuardianDetail> {
    const detail = await this.guardians.findDetail(
      ctx.organizationId,
      campusClassScopeOf(ctx),
      { id }
    );
    if (detail === undefined) {
      throw guardianNotFound();
    }
    return detail;
  }

  async linksOf(ctx: OrgContext, studentId: string): Promise<GuardianLink[]> {
    const links = await this.guardians.linksOf(
      ctx.organizationId,
      campusClassScopeOf(ctx),
      { studentId }
    );
    if (links === undefined) {
      throw studentNotFound();
    }
    return links;
  }

  /** The guardians of a student the caller has just admitted, whatever their scope. */
  linksOfAdmitted(ctx: OrgContext, studentId: string): Promise<GuardianLink[]> {
    return this.guardians.linksOf(
      ctx.organizationId,
      { campusScope: 'all', classScope: 'all' },
      { studentId }
    ) as Promise<GuardianLink[]>;
  }

  async link(
    ctx: OrgContext,
    studentId: string,
    draft: GuardianDraft
  ): Promise<LinkGuardianResult> {
    requirePermission(ctx, 'guardian:read');
    await this.visibleStudent(ctx, studentId);
    if ('new' in draft) {
      requirePermission(ctx, 'guardian:create');
    }
    const password = await this.passwordFor(draft);
    const outcome = await this.guardians.transaction((tx) =>
      this.linkInTransaction(tx, { ctx, studentId, draft, password })
    );
    const links = await this.linksOf(ctx, studentId);
    const link = links.find((row) => row.guardianId === outcome.guardianId);
    if (link === undefined) {
      throw guardianNotFound();
    }
    return {
      link,
      ...(outcome.credential === undefined
        ? {}
        : { login: outcome.credential }),
    };
  }

  async updateLink(
    ctx: OrgContext,
    input: { studentId: string; guardianId: string },
    patch: UpdateGuardianLinkInput
  ): Promise<GuardianLink> {
    requirePermission(ctx, 'guardian:read');
    await this.visibleStudent(ctx, input.studentId);
    await this.guardians.transaction(async (tx) => {
      await tx.lockStudent(ctx.organizationId, input.studentId);
      await changeLink(
        tx,
        { organizationId: ctx.organizationId, ...input },
        patch
      );
    });
    const links = await this.linksOf(ctx, input.studentId);
    const link = links.find((row) => row.guardianId === input.guardianId);
    if (link === undefined) {
      throw guardianNotFound();
    }
    return link;
  }

  async unlink(
    ctx: OrgContext,
    input: { studentId: string; guardianId: string }
  ): Promise<GuardianUnlinked> {
    await this.visibleStudent(ctx, input.studentId);
    await this.guardians.transaction(async (tx) => {
      const student = await tx.lockStudent(ctx.organizationId, input.studentId);
      const guardian = await tx.findGuardian(
        ctx.organizationId,
        input.guardianId
      );
      if (student === undefined || guardian === undefined) {
        throw guardianNotFound();
      }
      await removeLink(tx, {
        organizationId: ctx.organizationId,
        ...input,
        onRoll: student.onRoll,
      });
      await tx.recordActivity({
        organizationId: ctx.organizationId,
        campusId: student.campusId,
        pillar: 'foundation',
        kind: 'guardian.unlinked',
        actorUserId: ctx.user.id,
        subjectType: 'student',
        subjectId: student.id,
        text: `${guardian.fullName} unlinked from ${fullName(student)}.`,
        data: { guardianId: guardian.id },
      });
    });
    return input;
  }

  async update(
    ctx: OrgContext,
    id: string,
    patch: EditGuardianInput
  ): Promise<GuardianDetail> {
    requirePermission(ctx, 'guardian:read');
    await this.visibleGuardian(ctx, id);
    const { photoFileId, ...details } = patch;
    if (photoFileId !== undefined) {
      await this.changePhoto(ctx, id, photoFileId);
    }
    if (Object.keys(details).length > 0) {
      await this.guardians.updateDetails(ctx.organizationId, id, details);
    }
    return this.get(ctx, id);
  }

  async resetLogin(ctx: OrgContext, id: string): Promise<ResetLogin> {
    const guardian = await this.visibleGuardian(ctx, id);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.accounts.hashPassword(temporaryPassword);
    await this.guardians.transaction(async (tx) => {
      const holds = await tx.lockLogin(guardian.userId);
      if (holds === undefined) {
        throw guardianNotFound();
      }
      assertResettable(holds, ctx.organizationId);
      await tx.resetPassword(guardian.userId, passwordHash);
      await tx.recordActivity({
        organizationId: ctx.organizationId,
        campusId: null,
        pillar: 'access',
        kind: 'guardian.login_reset',
        actorUserId: ctx.user.id,
        subjectType: 'guardian',
        subjectId: guardian.id,
        text: `${ctx.user.name} reset ${guardian.fullName}’s login.`,
        data: { guardianId: guardian.id },
      });
    });
    return {
      ...(guardian.email === null
        ? { username: guardian.username ?? undefined }
        : { email: guardian.email }),
      temporaryPassword,
    };
  }

  private async visibleStudent(
    ctx: OrgContext,
    studentId: string
  ): Promise<StudentFacts> {
    const student = await this.guardians.findStudent(
      ctx.organizationId,
      campusClassScopeOf(ctx),
      { studentId }
    );
    if (student === undefined) {
      throw studentNotFound();
    }
    return student;
  }

  private async visibleGuardian(ctx: OrgContext, id: string) {
    const guardian = await this.guardians.findVisible(
      ctx.organizationId,
      campusClassScopeOf(ctx),
      { id }
    );
    if (guardian === undefined) {
      throw guardianNotFound();
    }
    return guardian;
  }

  private async changePhoto(
    ctx: OrgContext,
    id: string,
    fileId: string | null
  ): Promise<void> {
    const result = await this.guardians.setPhoto(
      ctx.organizationId,
      id,
      fileId
    );
    if (result.status === 'no-guardian') {
      throw guardianNotFound();
    }
    if (result.status === 'unusable') {
      throw new BadRequestException(GUARDIAN_PHOTO_INVALID_MESSAGE);
    }
    if (result.previousFileId !== null) {
      await this.files.discardById(ctx.organizationId, result.previousFileId);
    }
  }

  private async passwordFor(
    draft: GuardianDraft
  ): Promise<{ plain: string; hash: string } | undefined> {
    if (!('new' in draft)) {
      return undefined;
    }
    const plain = generateTemporaryPassword();
    return { plain, hash: await this.accounts.hashPassword(plain) };
  }

  private async linkInTransaction(
    tx: GuardianTx,
    input: {
      ctx: OrgContext;
      studentId: string;
      draft: GuardianDraft;
      password: { plain: string; hash: string } | undefined;
    }
  ): Promise<LinkOutcome> {
    const { ctx, studentId, draft, password } = input;
    const organizationId = ctx.organizationId;
    const student = await tx.lockStudent(organizationId, studentId);
    if (student === undefined) {
      throw studentNotFound();
    }
    const base = { organizationId, studentId, actorId: ctx.user.id };
    const outcome =
      'new' in draft
        ? await this.linkNew(tx, { ...base, draft: draft.new, password })
        : await this.linkExisting(tx, { ...base, draft });
    await tx.recordActivity({
      organizationId,
      campusId: student.campusId,
      pillar: 'foundation',
      kind: 'guardian.linked',
      actorUserId: ctx.user.id,
      subjectType: 'student',
      subjectId: student.id,
      text: `${outcome.name} linked to ${fullName(student)}.`,
      data: { guardianId: outcome.guardianId },
    });
    return { guardianId: outcome.guardianId, credential: outcome.credential };
  }

  private async linkExisting(
    tx: GuardianTx,
    input: {
      organizationId: string;
      studentId: string;
      actorId: string;
      draft: Extract<GuardianDraft, { existingGuardianId: string }>;
    }
  ) {
    const { draft, ...base } = input;
    const guardian = await tx.findGuardian(
      base.organizationId,
      draft.existingGuardianId
    );
    if (guardian === undefined) {
      throw guardianNotFound();
    }
    const { existingLinks } = await assertRoomForLink(tx, {
      organizationId: base.organizationId,
      studentId: base.studentId,
      guardianId: guardian.id,
    });
    await attachGuardian(tx, {
      ...base,
      guardianId: guardian.id,
      userId: guardian.userId,
      relationship: draft.relationship,
      paysFees: defaultPaysFees(existingLinks, draft.paysFees),
    });
    return {
      guardianId: guardian.id,
      name: guardian.fullName,
      credential: undefined,
    };
  }

  private async linkNew(
    tx: GuardianTx,
    input: {
      organizationId: string;
      studentId: string;
      actorId: string;
      draft: Extract<GuardianDraft, { new: unknown }>['new'];
      password: { plain: string; hash: string } | undefined;
    }
  ) {
    const { draft, password, ...base } = input;
    const { existingLinks } = await assertRoomForLink(tx, base);
    const provisioned = await provisionGuardian(tx, {
      organizationId: base.organizationId,
      actorId: base.actorId,
      guardian: draft,
      passwordHash: password?.hash ?? '',
    });
    await attachGuardian(tx, {
      ...base,
      guardianId: provisioned.guardianId,
      userId: provisioned.userId,
      relationship: draft.relationship,
      paysFees: defaultPaysFees(existingLinks, draft.paysFees),
    });
    return {
      guardianId: provisioned.guardianId,
      name: draft.fullName,
      credential: {
        who: 'guardian' as const,
        name: draft.fullName,
        guardianId: provisioned.guardianId,
        relationship: draft.relationship,
        existing: !provisioned.newLogin,
        ...(provisioned.email === null ? {} : { email: provisioned.email }),
        ...(provisioned.username === null
          ? {}
          : { username: provisioned.username }),
        ...(provisioned.newLogin && password !== undefined
          ? { temporaryPassword: password.plain }
          : {}),
      },
    };
  }
}
