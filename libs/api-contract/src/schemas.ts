import { ACTIONS, RESOURCES } from '@eduvault/policy';
import { z } from 'zod';

export const idSchema = z.uuid();
export const currencySchema = z.string().length(3).toUpperCase();
const timestamp = z.string();

export const idParamsSchema = z.object({ id: idSchema });

export const apiErrorCodeSchema = z.enum([
  'BadRequest',
  'Unauthorized',
  'Forbidden',
  'NoSchool',
  'SchoolSuspended',
  'ActingReadOnly',
  'MustChangePassword',
  'PasswordAlreadySet',
  'NotFound',
  'Conflict',
  'SelfApproval',
  'LAST_OWNER',
  'OWNER_BY_HANDOVER',
  'ROLE_COMBINATION',
  'SELF_REMOVAL',
  'SELF_RESET',
  'SHARED_ACCOUNT',
  'ValidationError',
  'InternalError',
  'UnknownError',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const errorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});
export type ApiErrorBody = z.infer<typeof errorSchema>;

export const healthSchema = z.object({ status: z.literal('ok') });

export const suspendedSchoolSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type SuspendedSchool = z.infer<typeof suspendedSchoolSchema>;

export const meSchema = z.object({
  user: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  activeOrganizationId: z.string().nullable(),
  activeCampusId: z.string().nullable(),
  mustChangePassword: z.boolean(),
  platformRole: z.literal('superadmin').nullable(),
  schoolCount: z.number().int().nonnegative(),
  suspendedSchool: suspendedSchoolSchema.nullable(),
});

export type Me = z.infer<typeof meSchema>;

export const PASSWORD_MIN_LENGTH = 10;
export const MUST_CHANGE_PASSWORD_MESSAGE =
  'Choose your own password before you continue';
export const TOO_MANY_ATTEMPTS_MESSAGE =
  'Too many attempts. Wait a minute and try again.';
export const BANNED_USER_MESSAGE =
  'This account is switched off. Ask your school owner.';

export const setPasswordSchema = z.object({
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(128),
});

export const permissionMapSchema = z.partialRecord(
  z.enum(RESOURCES),
  z.array(z.enum(ACTIONS))
);
export type PermissionMap = z.infer<typeof permissionMapSchema>;

export const scopeSchema = z.union([z.literal('all'), z.array(z.string())]);
export type Scope = z.infer<typeof scopeSchema>;

export const ACTING_ORG_HEADER = 'x-eduvault-acting-org';
export const ACTING_REASON_HEADER = 'x-eduvault-acting-reason';
export const ACTING_REASON_MAX_LENGTH = 200;
export const actingReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(ACTING_REASON_MAX_LENGTH);

/** HTTP header values are Latin-1 only, so the reason travels percent-encoded. */
export const encodeActingReason = (reason: string): string =>
  encodeURIComponent(reason);

/** Methods that never change data; acting without a reason may use only these. */
export const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;
export const isReadMethod = (method: string): boolean =>
  (READ_METHODS as readonly string[]).includes(method.toUpperCase());

export const mePermissionsSchema = z.object({
  organizationId: z.string(),
  roles: z.array(z.string()),
  permissions: permissionMapSchema,
  campusScope: scopeSchema,
  classScope: scopeSchema,
  acting: z
    .object({ organizationId: z.string(), writes: z.boolean() })
    .nullable(),
});
export type MePermissions = z.infer<typeof mePermissionsSchema>;

export const campusSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string(),
  address: z.string().nullable(),
  createdAt: timestamp,
});
export type Campus = z.infer<typeof campusSchema>;
export const createCampusSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullish(),
});
export const updateCampusSchema = createCampusSchema.partial();

export const ADMISSION_PREFIX_MAX_LENGTH = 6;
export const SCHOOL_SLUG_MAX_LENGTH = 40;

const admissionPrefixSchema = z
  .string()
  .regex(new RegExp(`^[A-Z]{2,${ADMISSION_PREFIX_MAX_LENGTH}}$`));

export const schoolAccountSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string(),
  currency: currencySchema,
  admissionPrefix: admissionPrefixSchema,
  city: z.string().nullable(),
  createdAt: timestamp,
});
export type SchoolAccount = z.infer<typeof schoolAccountSchema>;
export const createSchoolAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: currencySchema,
  admissionPrefix: admissionPrefixSchema,
  city: z.string().trim().max(120).optional(),
});
export const updateSchoolAccountSchema = createSchoolAccountSchema.partial();

export const feeScheduleSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  campusId: idSchema.nullable(),
  name: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  createdAt: timestamp,
});
export type FeeSchedule = z.infer<typeof feeScheduleSchema>;
export const createFeeScheduleSchema = z.object({
  campusId: idSchema.nullish(),
  name: z.string().trim().min(1).max(120),
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
});
export const updateFeeScheduleSchema = createFeeScheduleSchema.partial();

export const studentSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  campusId: idSchema,
  fullName: z.string(),
  admissionNumber: z.string(),
  createdAt: timestamp,
});
export type Student = z.infer<typeof studentSchema>;
export const createStudentSchema = z.object({
  campusId: idSchema.optional(),
  fullName: z.string().trim().min(1).max(160),
  admissionNumber: z.string().trim().min(1).max(40),
});
export const updateStudentSchema = createStudentSchema.partial();

export const campusFilterSchema = z.object({ campusId: idSchema.optional() });

export const platformSchoolIdParamsSchema = z.object({ id: z.string().min(1) });

export const schoolStatusSchema = z.enum(['active', 'suspended']);
export type SchoolStatus = z.infer<typeof schoolStatusSchema>;

export const platformSchoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  admissionPrefix: admissionPrefixSchema,
  city: z.string().nullable(),
  owners: z.array(
    z.object({ id: z.string(), name: z.string(), email: z.string() })
  ),
  students: z.number().int().nonnegative(),
  campuses: z.number().int().nonnegative(),
  status: schoolStatusSchema,
  createdAt: timestamp,
});
export type PlatformSchool = z.infer<typeof platformSchoolSchema>;

export const createSchoolSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .regex(new RegExp(`^[a-z0-9-]{3,${SCHOOL_SLUG_MAX_LENGTH}}$`)),
  admissionPrefix: admissionPrefixSchema,
  city: z.string().trim().max(120).optional(),
  ownerName: z.string().trim().min(1).max(120),
  ownerEmail: z.email(),
});
export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;

export const createSchoolResultSchema = z.object({
  school: platformSchoolSchema,
  owner: z.object({ id: z.string(), email: z.string() }),
  temporaryPassword: z.string().nullable(),
});
export type CreateSchoolResult = z.infer<typeof createSchoolResultSchema>;

export const platformSchoolListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  cursor: z.string().max(500).optional(),
});

export const platformSchoolListSchema = z.object({
  items: z.array(platformSchoolSchema),
  totals: z.object({
    schools: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    students: z.number().int().nonnegative(),
    actingRequests: z.number().int().nonnegative(),
  }),
  nextCursor: z.string().nullable(),
});
export type PlatformSchoolList = z.infer<typeof platformSchoolListSchema>;

export const platformSchoolOptionsSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type PlatformSchoolOptions = z.infer<typeof platformSchoolOptionsSchema>;

export const platformSchoolMemberSchema = z.object({
  memberId: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  roles: z.array(z.string()),
});
export type PlatformSchoolMember = z.infer<typeof platformSchoolMemberSchema>;

export const platformSchoolMembersSchema = z.object({
  items: z.array(platformSchoolMemberSchema),
});

export const replaceOwnerSchema = z.object({
  newOwner: z.union([
    z.object({ memberId: z.string().min(1) }),
    z.object({
      name: z.string().trim().min(1).max(120),
      email: z.email(),
    }),
  ]),
  previousOwner: z.enum(['member', 'remove']),
});
export type ReplaceOwnerInput = z.infer<typeof replaceOwnerSchema>;

export const replaceOwnerResultSchema = z.object({
  school: platformSchoolSchema,
  temporaryPassword: z.string().nullable(),
});
export type ReplaceOwnerResult = z.infer<typeof replaceOwnerResultSchema>;

export const AUDIT_KINDS = ['acting', 'platform'] as const;
export const AUDIT_ACTIONS = [
  'school.create',
  'school.suspend',
  'school.reactivate',
  'school.replaceOwner',
] as const;
export const AUDIT_PAGE_SIZE = 10;
export const AUDIT_MAX_PAGE_SIZE = 50;

export const auditRowSchema = z.object({
  id: z.string(),
  kind: z.enum(AUDIT_KINDS),
  actor: z.object({ id: z.string(), name: z.string() }),
  school: z.object({ id: z.string(), name: z.string() }).nullable(),
  method: z.string().nullable(),
  action: z.enum(AUDIT_ACTIONS).nullable(),
  path: z.string(),
  status: z.number().int(),
  reason: z.string().nullable(),
  createdAt: timestamp,
});
export type AuditRow = z.infer<typeof auditRowSchema>;

export const auditListQuerySchema = z.object({
  schoolId: z.string().optional(),
  writesOnly: z.union([z.boolean(), z.stringbool()]).optional(),
  kind: z.enum(AUDIT_KINDS).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(AUDIT_MAX_PAGE_SIZE)
    .default(AUDIT_PAGE_SIZE),
});

export const auditListSchema = z.object({
  items: z.array(auditRowSchema),
  nextCursor: z.string().nullable(),
});
export type AuditList = z.infer<typeof auditListSchema>;

export const MEMBER_PAGE_SIZE = 10;
export const DEFAULT_MEMBER_TITLE = 'New member';

const NAME_REQUIRED = 'Enter their full name.';
const EMAIL_REQUIRED = 'Enter their email address.';
export const CAMPUS_REQUIRED = 'Choose at least one campus.';

const campusIdsSchema = z
  .array(idSchema, { error: CAMPUS_REQUIRED })
  .min(1, CAMPUS_REQUIRED);

export const memberSummarySchema = z.object({
  id: idSchema,
  userId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  title: z.string(),
  roles: z.array(z.string()),
  campusIds: z.array(idSchema),
});
export type MemberSummary = z.infer<typeof memberSummarySchema>;

export const memberDetailSchema = memberSummarySchema.extend({
  permissions: permissionMapSchema,
  campusScope: scopeSchema,
  classScope: scopeSchema,
  lastOwner: z.boolean(),
});
export type MemberDetail = z.infer<typeof memberDetailSchema>;

export const memberListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const memberListSchema = z.object({
  items: z.array(memberSummarySchema),
  total: z.number().int().nonnegative(),
});
export type MemberList = z.infer<typeof memberListSchema>;

export const createMemberSchema = z.object({
  name: z
    .string({ error: NAME_REQUIRED })
    .trim()
    .min(1, NAME_REQUIRED)
    .max(120),
  email: z
    .string({ error: EMAIL_REQUIRED })
    .trim()
    .toLowerCase()
    .pipe(z.email(EMAIL_REQUIRED)),
  title: z.string().trim().max(80).optional(),
  campusIds: campusIdsSchema,
});
export type CreateMemberInput = z.input<typeof createMemberSchema>;

export const createMemberResultSchema = z.object({
  member: memberDetailSchema,
  temporaryPassword: z.string().nullable(),
});
export type CreateMemberResult = z.infer<typeof createMemberResultSchema>;

export const resetMemberPasswordResultSchema = z.object({
  temporaryPassword: z.string(),
});
export type ResetMemberPasswordResult = z.infer<
  typeof resetMemberPasswordResultSchema
>;

export const updateMemberRolesSchema = z.object({
  roles: z.array(z.string().trim().min(1).max(80)),
  campusIds: campusIdsSchema.optional(),
});

export const updateMemberTitleSchema = z.object({
  title: z.string().trim().max(80),
});
export type UpdateMemberTitleInput = z.input<typeof updateMemberTitleSchema>;

export const updateMemberCampusesSchema = z.object({
  campusIds: campusIdsSchema,
});

export const schoolRoleEntrySchema = z.object({
  slug: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  source: z.enum(['code', 'starter', 'custom']),
  permissions: permissionMapSchema,
});
export type SchoolRoleEntry = z.infer<typeof schoolRoleEntrySchema>;

export const unknownRoleEntry = (slug: string): SchoolRoleEntry => ({
  slug,
  label: slug,
  description: null,
  source: 'custom',
  permissions: {},
});

export const schoolRoleSchema = schoolRoleEntrySchema.extend({
  grantable: z.boolean(),
});
export type SchoolRole = z.infer<typeof schoolRoleSchema>;
