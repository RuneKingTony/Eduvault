import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CAMPUS_REQUIRED,
  DEFAULT_MEMBER_TITLE,
  unknownRoleEntry,
  type ApiErrorCode,
  type CreateMemberResult,
  type MemberDetail,
  type MemberList,
  type MemberSummary,
  type ResetMemberPasswordResult,
  type SchoolRole,
  type SchoolRoleEntry,
} from '@eduvault/api-contract';
import {
  ALL_PERMISSIONS,
  MEMBER_ROLE,
  OWNER_ROLE,
  canGrantRole,
  can,
  needsCampusStep,
  permissionsOfRoles,
  roleDiff,
  toPermissionMap,
  validateRoleCombo,
  type RoleDiff,
  withMemberRole,
} from '@eduvault/policy';
import { MemberAdminService, type OrgContext } from '../../common/auth';
import { canSeeCampus, type CampusScope } from '../../common/campus-scope';
import { CampusService } from '../campus/campus.service';
import { MembersRepository, type MemberRecord } from './members.repository';

interface ListInput {
  q?: string;
  role?: string;
  page: number;
}

interface CreateInput {
  name: string;
  email: string;
  title?: string;
  campusIds: string[];
}

interface RolesInput {
  roles: string[];
  campusIds?: string[];
}

interface CampusChange {
  add: string[];
  remove: string[];
}

interface Account {
  userId: string;
  temporaryPassword: string | null;
  createdHere: boolean;
}

const coded = (code: ApiErrorCode, message: string) => ({ code, message });

const notFound = () => new NotFoundException('Member not found');

const CODE_ROLES: readonly SchoolRoleEntry[] = [
  {
    slug: OWNER_ROLE,
    label: 'Owner',
    description: 'Can do everything in the school.',
    source: 'code',
    permissions: toPermissionMap(ALL_PERMISSIONS),
  },
  {
    slug: MEMBER_ROLE,
    label: 'Member',
    description: 'On the staff list. Grants nothing on its own.',
    source: 'code',
    permissions: {},
  },
];

const byLabel = (a: SchoolRoleEntry, b: SchoolRoleEntry) =>
  a.label.localeCompare(b.label) || a.slug.localeCompare(b.slug);

function catalogue(rows: readonly SchoolRoleEntry[]): SchoolRoleEntry[] {
  return [
    ...CODE_ROLES,
    ...rows.filter((row) => row.source === 'starter').toSorted(byLabel),
    ...rows.filter((row) => row.source === 'custom').toSorted(byLabel),
  ];
}

const sharesCampus = (scope: CampusScope, record: MemberRecord): boolean =>
  scope === 'all' ||
  record.campusIds.some((campusId) => canSeeCampus(scope, campusId));

const limitToScope = (
  record: MemberRecord,
  scope: CampusScope
): MemberSummary => ({
  ...record,
  campusIds: record.campusIds.filter((campusId) =>
    canSeeCampus(scope, campusId)
  ),
});

function campusChange(
  ctx: OrgContext,
  record: MemberRecord,
  requested: readonly string[]
): CampusChange {
  const kept = record.campusIds.filter(
    (campusId) => !canSeeCampus(ctx.campusScope, campusId)
  );
  const finalSet = new Set([...kept, ...requested]);
  return {
    add: [...finalSet].filter(
      (campusId) => !record.campusIds.includes(campusId)
    ),
    remove: record.campusIds.filter((campusId) => !finalSet.has(campusId)),
  };
}

const titleOrDefault = (title: string | undefined): string =>
  title === undefined || title === '' ? DEFAULT_MEMBER_TITLE : title;

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly members: MembersRepository,
    private readonly campuses: CampusService,
    private readonly admin: MemberAdminService
  ) {}

  async list(ctx: OrgContext, input: ListInput): Promise<MemberList> {
    const { items, total } = await this.members.list({
      organizationId: ctx.organizationId,
      scope: ctx.campusScope,
      q: input.q === '' ? undefined : input.q,
      role: input.role === '' ? undefined : input.role,
      page: input.page,
    });
    return {
      items: items.map((item) => limitToScope(item, ctx.campusScope)),
      total,
    };
  }

  async roles(ctx: OrgContext): Promise<SchoolRole[]> {
    const entries = await this.loadCatalogue(ctx);
    return entries.map((entry) => ({
      ...entry,
      grantable:
        entry.slug !== OWNER_ROLE && this.grantable(ctx, entry).allowed,
    }));
  }

  async get(ctx: OrgContext, id: string): Promise<MemberDetail> {
    const record = await this.visible(ctx, id);
    return this.detail(ctx, record, await this.loadCatalogue(ctx));
  }

  async create(
    ctx: OrgContext,
    input: CreateInput
  ): Promise<CreateMemberResult> {
    const campusIds = [...new Set(input.campusIds)];
    for (const campusId of campusIds) {
      await this.campuses.assertInScope(ctx, campusId);
    }
    return this.admin.underSchoolLock(ctx.organizationId, async () => {
      const account = await this.resolveAccount(ctx, input);
      await this.addMember(ctx, account, {
        title: titleOrDefault(input.title),
        campusIds,
      });
      const record = await this.members.findByUser(
        ctx.organizationId,
        account.userId
      );
      if (record === undefined) {
        throw new InternalServerErrorException('Could not add the member');
      }
      return {
        member: await this.detail(ctx, record, await this.loadCatalogue(ctx)),
        temporaryPassword: account.temporaryPassword,
      };
    });
  }

  updateRoles(
    ctx: OrgContext,
    id: string,
    input: RolesInput
  ): Promise<MemberDetail> {
    return this.admin.underSchoolLock(ctx.organizationId, async () => {
      const record = await this.visible(ctx, id);
      const entries = await this.loadCatalogue(ctx);
      const draft = withMemberRole(input.roles);
      await this.checkRoleChange({ ctx, record, draft, entries, input });
      const campuses =
        input.campusIds === undefined
          ? { add: [], remove: [] }
          : campusChange(ctx, record, input.campusIds);
      await this.admin.setRolesAndCampuses({
        memberId: record.id,
        userId: record.userId,
        roles: draft,
        addCampusIds: campuses.add,
        removeCampusIds: campuses.remove,
      });
      return this.reload(ctx, record.id, entries);
    });
  }

  async updateTitle(
    ctx: OrgContext,
    id: string,
    title: string
  ): Promise<MemberDetail> {
    const record = await this.visible(ctx, id);
    await this.members.updateTitle(
      ctx.organizationId,
      record.id,
      titleOrDefault(title)
    );
    return this.reload(ctx, record.id, await this.loadCatalogue(ctx));
  }

  updateCampuses(
    ctx: OrgContext,
    id: string,
    input: { campusIds: string[] }
  ): Promise<MemberDetail> {
    return this.admin.underSchoolLock(ctx.organizationId, async () => {
      const record = await this.visible(ctx, id);
      for (const campusId of input.campusIds) {
        await this.campuses.assertInScope(ctx, campusId);
      }
      const change = campusChange(ctx, record, input.campusIds);
      await this.admin.setCampuses({
        userId: record.userId,
        addCampusIds: change.add,
        removeCampusIds: change.remove,
      });
      return this.reload(ctx, record.id, await this.loadCatalogue(ctx));
    });
  }

  resetPassword(
    ctx: OrgContext,
    id: string
  ): Promise<ResetMemberPasswordResult> {
    return this.admin.underSchoolLock(ctx.organizationId, async () => {
      const record = await this.visible(ctx, id);
      await this.checkReset(ctx, record);
      const temporaryPassword = await this.admin.resetPassword(record.userId);
      this.logger.log(
        `Password reset: member ${record.id} by user ${ctx.user.id} in school ${ctx.organizationId}`
      );
      return { temporaryPassword };
    });
  }

  remove(ctx: OrgContext, id: string): Promise<{ id: string }> {
    return this.admin.underSchoolLock(ctx.organizationId, async () => {
      const record = await this.visible(ctx, id);
      await this.checkRemoval(ctx, record);
      await this.admin.removeMember({
        memberId: record.id,
        organizationId: ctx.organizationId,
        userId: record.userId,
      });
      return { id: record.id };
    });
  }

  private async loadCatalogue(ctx: OrgContext): Promise<SchoolRoleEntry[]> {
    return catalogue(await this.members.listRoles(ctx.organizationId));
  }

  private async visible(ctx: OrgContext, id: string): Promise<MemberRecord> {
    const record = await this.members.findById(ctx.organizationId, id);
    if (record === undefined || !sharesCampus(ctx.campusScope, record)) {
      throw notFound();
    }
    return record;
  }

  private async reload(
    ctx: OrgContext,
    id: string,
    entries: readonly SchoolRoleEntry[]
  ): Promise<MemberDetail> {
    const record = await this.members.findById(ctx.organizationId, id);
    if (record === undefined) {
      throw notFound();
    }
    return this.detail(ctx, record, entries);
  }

  private async detail(
    ctx: OrgContext,
    record: MemberRecord,
    entries: readonly SchoolRoleEntry[]
  ): Promise<MemberDetail> {
    const visible = limitToScope(record, ctx.campusScope);
    const permissions = permissionsOfRoles(record.roles, entries);
    return {
      ...visible,
      permissions,
      campusScope: can(permissions, 'campus', 'readAll')
        ? 'all'
        : visible.campusIds,
      classScope: 'all',
      lastOwner: await this.isLastOwner(ctx, record),
    };
  }

  private async isLastOwner(
    ctx: OrgContext,
    record: MemberRecord
  ): Promise<boolean> {
    return (
      record.roles.includes(OWNER_ROLE) &&
      (await this.members.countOwners(ctx.organizationId)) <= 1
    );
  }

  private grantable(ctx: OrgContext, entry: SchoolRoleEntry) {
    return canGrantRole({
      slug: entry.slug,
      rolePermissions: entry.permissions,
      assignerPermissions: ctx.permissions,
      assignerIsOwner: ctx.isOwner,
    });
  }

  private async resolveAccount(
    ctx: OrgContext,
    input: CreateInput
  ): Promise<Account> {
    const existing = await this.admin.findAccount(input.email);
    if (existing === undefined) {
      const created = await this.admin.createAccount({
        name: input.name,
        email: input.email,
        mustChangePassword: true,
      });
      return {
        userId: created.user.id,
        temporaryPassword: created.temporaryPassword,
        createdHere: true,
      };
    }
    if (existing.isSuperAdmin) {
      throw new ConflictException(
        `${input.email} can’t be added to this school.`
      );
    }
    if (await this.members.findByUser(ctx.organizationId, existing.id)) {
      throw new ConflictException(
        `${input.email} is already on the staff list.`
      );
    }
    return { userId: existing.id, temporaryPassword: null, createdHere: false };
  }

  private async addMember(
    ctx: OrgContext,
    account: Account,
    details: { title: string; campusIds: string[] }
  ): Promise<void> {
    try {
      await this.admin.addMember({
        organizationId: ctx.organizationId,
        userId: account.userId,
        ...details,
      });
    } catch (error) {
      this.logger.error(
        `Add member failed: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      if (account.createdHere) {
        await this.admin.deleteAccount(account.userId);
      }
      throw new InternalServerErrorException('Could not add the member');
    }
  }

  private async checkRoleChange(change: {
    ctx: OrgContext;
    record: MemberRecord;
    draft: string[];
    entries: readonly SchoolRoleEntry[];
    input: RolesInput;
  }): Promise<void> {
    const { ctx, record, draft, entries, input } = change;
    const known = new Set(entries.map((entry) => entry.slug));
    const unknown = draft.find(
      (slug) => !known.has(slug) && !record.roles.includes(slug)
    );
    if (unknown !== undefined) {
      throw new NotFoundException('Role not found');
    }
    for (const campusId of input.campusIds ?? []) {
      await this.campuses.assertInScope(ctx, campusId);
    }
    const diff = roleDiff(record.roles, draft);
    if (diff.added.includes(OWNER_ROLE) || diff.removed.includes(OWNER_ROLE)) {
      throw new ConflictException(
        coded(
          'OWNER_BY_HANDOVER',
          'Ownership changes only by handing the school over.'
        )
      );
    }
    this.assertCanChange(ctx, diff, entries);
    this.assertCombination(record, draft, entries);
    const needsCampus = needsCampusStep(permissionsOfRoles(draft, entries));
    if (needsCampus && input.campusIds === undefined) {
      throw new BadRequestException(CAMPUS_REQUIRED);
    }
  }

  private assertCanChange(
    ctx: OrgContext,
    diff: RoleDiff,
    entries: readonly SchoolRoleEntry[]
  ): void {
    const attempts = [
      ...diff.added.map((slug) => ({ slug, verb: 'give out' })),
      ...diff.removed.map((slug) => ({ slug, verb: 'remove' })),
    ];
    for (const { slug, verb } of attempts) {
      const entry =
        entries.find((candidate) => candidate.slug === slug) ??
        unknownRoleEntry(slug);
      if (!this.grantable(ctx, entry).allowed) {
        throw new ForbiddenException(
          `You can’t ${verb} ${entry.label}: it allows things you can’t do yourself.`
        );
      }
    }
  }

  private assertCombination(
    record: MemberRecord,
    draft: string[],
    entries: readonly SchoolRoleEntry[]
  ): void {
    const message = validateRoleCombo({
      current: record.roles,
      draft,
      memberName: record.name,
      labelOf: (slug) =>
        entries.find((entry) => entry.slug === slug)?.label ?? slug,
    });
    if (message !== undefined) {
      throw new ConflictException(coded('ROLE_COMBINATION', message));
    }
  }

  private async checkRemoval(
    ctx: OrgContext,
    record: MemberRecord
  ): Promise<void> {
    if (await this.isLastOwner(ctx, record)) {
      throw new ConflictException(
        coded(
          'LAST_OWNER',
          `${record.name} is the school’s only owner and can’t be removed.`
        )
      );
    }
    if (record.userId === ctx.user.id) {
      throw new ConflictException(
        coded('SELF_REMOVAL', 'You can’t remove yourself from the school.')
      );
    }
    await this.assertReaches(ctx, record, 'remove');
  }

  private async checkReset(
    ctx: OrgContext,
    record: MemberRecord
  ): Promise<void> {
    if (record.userId === ctx.user.id) {
      throw new ConflictException(
        coded('SELF_RESET', 'You can’t reset your own password here.')
      );
    }
    await this.assertReaches(ctx, record, 'reset the password of');
    if (
      ctx.acting?.writes !== true &&
      (await this.members.belongsToOtherSchool(
        record.userId,
        ctx.organizationId
      ))
    ) {
      throw new ConflictException(
        coded(
          'SHARED_ACCOUNT',
          `${record.name} also belongs to another school, so only Eduvault support can reset their password.`
        )
      );
    }
  }

  /** What the editor needs before acting on a member: their campuses and every role they hold. */
  private async assertReaches(
    ctx: OrgContext,
    record: MemberRecord,
    verb: string
  ): Promise<void> {
    if (
      record.campusIds.some(
        (campusId) => !canSeeCampus(ctx.campusScope, campusId)
      )
    ) {
      throw new ForbiddenException(
        `You can’t ${verb} ${record.name}: they also work on campuses you can’t see.`
      );
    }
    const entries = await this.loadCatalogue(ctx);
    const blocked = record.roles
      .map((slug) => entries.find((entry) => entry.slug === slug))
      .find(
        (entry) => entry !== undefined && !this.grantable(ctx, entry).allowed
      );
    if (blocked !== undefined) {
      throw new ForbiddenException(
        `You can’t ${verb} ${record.name}: they hold ${blocked.label}, which allows things you can’t do yourself.`
      );
    }
  }
}
