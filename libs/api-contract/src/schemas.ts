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
  'MustChangePassword',
  'PasswordAlreadySet',
  'NotFound',
  'Conflict',
  'SelfApproval',
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

export const meSchema = z.object({
  user: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  activeOrganizationId: z.string().nullable(),
  activeCampusId: z.string().nullable(),
  mustChangePassword: z.boolean(),
  platformRole: z.literal('superadmin').nullable(),
  schoolCount: z.number().int().nonnegative(),
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

export const platformSchoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  admissionPrefix: admissionPrefixSchema,
  city: z.string().nullable(),
  owners: z.array(
    z.object({ id: z.string(), name: z.string(), email: z.string() })
  ),
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

export const platformSchoolListSchema = z.object({
  items: z.array(platformSchoolSchema),
});
