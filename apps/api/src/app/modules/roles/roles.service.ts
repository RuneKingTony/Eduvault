import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BUILT_IN_ROLE_MESSAGE,
  MEMBER_ENTRY,
  OWNER_ENTRY,
  ROLE_ESCALATION_MESSAGE,
  ROLE_NOT_FOUND_MESSAGE,
  ROLE_PROTECTED_MESSAGE,
  TOO_MANY_ROLES_MESSAGE,
  roleInUseMessage,
  roleLabelTakenMessage,
  type ApiErrorCode,
  type Role,
  type RoleHolder,
  type RoleList,
  type SchoolRoleEntry,
} from '@eduvault/api-contract';
import {
  MAX_ROLES_PER_SCHOOL,
  MEMBER_ROLE,
  OWNER_ROLE,
  PORTAL_ROLES,
  PROTECTED_ROLES,
  STARTER_ROLES,
  can,
  deriveRoleSlug,
  isPortalOnly,
  isRoleEditable,
  isValidRoleSlug,
  missingPermissions,
  permLabel,
  toPermissionMap,
  toPermissions,
  unknownPermissions,
  type Permission,
  type PermissionMap,
} from '@eduvault/policy';
import { RoleAdminService, type OrgContext } from '../../common/auth';
import { canSeeCampus } from '../../common/campus-scope';
import {
  RolesRepository,
  type RoleMemberRecord,
  type RoleRecord,
} from './roles.repository';

interface CreateInput {
  label: string;
  description?: string | null;
  permissions: PermissionMap;
  slug?: string;
}

interface UpdateInput {
  label?: string;
  description?: string | null;
  permissions?: PermissionMap;
}

const BUILT_IN_LABELS: readonly string[] = [
  OWNER_ENTRY.label,
  MEMBER_ENTRY.label,
];

const coded = (code: ApiErrorCode, message: string) => ({ code, message });

const builtIn = () =>
  new ConflictException(coded('BUILT_IN_ROLE', BUILT_IN_ROLE_MESSAGE));

const notFound = () => new NotFoundException(ROLE_NOT_FOUND_MESSAGE);

const isBuiltIn = (slug: string): boolean =>
  slug === OWNER_ROLE || slug === MEMBER_ROLE;

const escalation = (missing: readonly Permission[]) =>
  new ForbiddenException({
    code: 'ROLE_ESCALATION' satisfies ApiErrorCode,
    message: ROLE_ESCALATION_MESSAGE,
    issues: missing.map((permission) => ({
      path: permission,
      message: permLabel(permission),
    })),
  });

const sameLabel = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const normalized = (map: PermissionMap): PermissionMap =>
  toPermissionMap(toPermissions(map));

const STARTER_ORDER = new Map(
  STARTER_ROLES.map((role, index) => [role.slug, index])
);

const byCreation = (a: RoleRecord, b: RoleRecord) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.slug.localeCompare(b.slug);

function ordered(rows: readonly RoleRecord[]): RoleRecord[] {
  const starters = rows.filter((row) => row.source === 'starter');
  const seeded = starters
    .filter((row) => STARTER_ORDER.has(row.slug))
    .toSorted(
      (a, b) =>
        (STARTER_ORDER.get(a.slug) ?? 0) - (STARTER_ORDER.get(b.slug) ?? 0)
    );
  const extra = starters
    .filter((row) => !STARTER_ORDER.has(row.slug))
    .toSorted(byCreation);
  return [
    ...seeded,
    ...extra,
    ...rows.filter((row) => row.source === 'custom').toSorted(byCreation),
  ];
}

const holderOf = (member: RoleMemberRecord): RoleHolder => ({
  memberId: member.memberId,
  name: member.name,
  roles: member.roles,
});

const visibleHolder = (
  ctx: OrgContext,
  slug: string,
  member: RoleMemberRecord
): boolean =>
  ctx.campusScope === 'all' ||
  (member.campusIds.some((campusId) =>
    canSeeCampus(ctx.campusScope, campusId)
  ) &&
    (PORTAL_ROLES.includes(slug) || !isPortalOnly(member.roles)));

function present(
  ctx: OrgContext,
  entry: SchoolRoleEntry,
  holders: readonly RoleMemberRecord[]
): Role {
  return {
    slug: entry.slug,
    label: entry.label,
    description: entry.description,
    source: entry.source,
    permissions: entry.permissions,
    holderCount: holders.length,
    ...(can(ctx.permissions, 'member', 'read')
      ? {
          holders: holders
            .filter((holder) => visibleHolder(ctx, entry.slug, holder))
            .map((holder) => holderOf(holder)),
        }
      : {}),
    editable: isRoleEditable({
      slug: entry.slug,
      rolePermissions: entry.permissions,
      editorPermissions: ctx.permissions,
      isNew: false,
    }),
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly admin: RoleAdminService
  ) {}

  async list(ctx: OrgContext): Promise<RoleList> {
    return { items: await this.load(ctx) };
  }

  async get(ctx: OrgContext, slug: string): Promise<Role> {
    const roles = await this.load(ctx);
    const role = roles.find((entry) => entry.slug === slug);
    if (role === undefined) {
      throw notFound();
    }
    return role;
  }

  create(ctx: OrgContext, input: CreateInput): Promise<Role> {
    return this.admin.underSchoolLock(ctx.organizationId, async () => {
      this.assertKnown(input.permissions, input.slug);
      this.assertHolds(ctx, input.permissions);
      const rows = await this.roles.listRoles(ctx.organizationId);
      if (rows.length >= MAX_ROLES_PER_SCHOOL) {
        throw new BadRequestException(
          coded('TOO_MANY_ROLES', TOO_MANY_ROLES_MESSAGE)
        );
      }
      this.assertLabelFree(input.label, rows);
      const taken = rows.map((row) => row.slug);
      const slug =
        input.slug !== undefined && !taken.includes(input.slug)
          ? input.slug
          : deriveRoleSlug(input.label, taken);
      await this.admin.create({
        organizationId: ctx.organizationId,
        slug,
        label: input.label,
        description: input.description ?? null,
        permissions: normalized(input.permissions),
      });
      return this.get(ctx, slug);
    });
  }

  update(ctx: OrgContext, slug: string, input: UpdateInput): Promise<Role> {
    return this.admin.underSchoolLock(ctx.organizationId, async () => {
      if (isBuiltIn(slug)) {
        throw builtIn();
      }
      const rows = await this.roles.listRoles(ctx.organizationId);
      const row = rows.find((candidate) => candidate.slug === slug);
      if (row === undefined) {
        throw notFound();
      }
      this.assertKnown(input.permissions ?? {});
      this.assertHolds(ctx, row.permissions);
      if (input.permissions !== undefined) {
        this.assertHolds(ctx, input.permissions);
      }
      if (input.label !== undefined) {
        this.assertLabelFree(
          input.label,
          rows.filter((candidate) => candidate.slug !== slug)
        );
      }
      if (Object.values(input).every((value) => value === undefined)) {
        return this.get(ctx, slug);
      }
      await this.admin.update(
        { organizationId: ctx.organizationId, slug },
        {
          label: input.label,
          description: input.description,
          permissions:
            input.permissions === undefined
              ? undefined
              : normalized(input.permissions),
        }
      );
      return this.get(ctx, slug);
    });
  }

  remove(ctx: OrgContext, slug: string): Promise<{ slug: string }> {
    return this.admin.underSchoolLock(ctx.organizationId, async () => {
      if (isBuiltIn(slug)) {
        throw builtIn();
      }
      const rows = await this.roles.listRoles(ctx.organizationId);
      const row = rows.find((candidate) => candidate.slug === slug);
      if (row === undefined) {
        throw notFound();
      }
      if (PROTECTED_ROLES.includes(slug)) {
        throw new ConflictException(
          coded('ROLE_PROTECTED', ROLE_PROTECTED_MESSAGE)
        );
      }
      this.assertHolds(ctx, row.permissions);
      const members = await this.roles.listMembers(ctx.organizationId);
      const holders = members.filter((member) => member.roles.includes(slug));
      if (holders.length > 0) {
        const nameThem =
          can(ctx.permissions, 'member', 'read') &&
          holders.every((holder) => visibleHolder(ctx, slug, holder));
        throw new ConflictException(
          coded(
            'ROLE_IN_USE',
            roleInUseMessage(
              nameThem ? holders.map((holder) => holder.name) : holders.length
            )
          )
        );
      }
      await this.admin.remove({ organizationId: ctx.organizationId, slug });
      return { slug };
    });
  }

  private async load(ctx: OrgContext): Promise<Role[]> {
    const [rows, members] = await Promise.all([
      this.roles.listRoles(ctx.organizationId),
      this.roles.listMembers(ctx.organizationId),
    ]);
    const heldBy = (slug: string) =>
      members.filter((member) => member.roles.includes(slug));
    return [
      present(ctx, OWNER_ENTRY, heldBy(OWNER_ROLE)),
      present(ctx, MEMBER_ENTRY, members),
      ...ordered(rows).map((row) => present(ctx, row, heldBy(row.slug))),
    ];
  }

  private assertKnown(permissions: PermissionMap, slug?: string): void {
    const unknown = unknownPermissions(permissions);
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'BadRequest' satisfies ApiErrorCode,
        message: 'Some of those permissions don’t exist.',
        issues: unknown.map((permission) => ({
          path: permission,
          message: 'Unknown permission',
        })),
      });
    }
    if (slug !== undefined && !isValidRoleSlug(slug)) {
      throw new BadRequestException(
        coded(
          'BadRequest',
          'A role key uses 2 to 40 lower-case letters, digits or dashes, and can’t be owner, member, admin or new.'
        )
      );
    }
  }

  private assertHolds(ctx: OrgContext, permissions: PermissionMap): void {
    const missing = missingPermissions(permissions, ctx.permissions);
    if (missing.length > 0) {
      throw escalation(missing);
    }
  }

  private assertLabelFree(label: string, others: readonly RoleRecord[]): void {
    const taken =
      BUILT_IN_LABELS.some((name) => sameLabel(name, label)) ||
      others.some((row) => sameLabel(row.label, label));
    if (taken) {
      throw new ConflictException(
        coded('ROLE_LABEL_TAKEN', roleLabelTakenMessage(label))
      );
    }
  }
}
