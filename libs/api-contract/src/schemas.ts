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
  'NotFound',
  'Conflict',
  'SelfApproval',
  'InternalError',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const errorSchema = z.object({
  code: z.string(),
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

export const schoolAccountSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string(),
  currency: currencySchema,
  createdAt: timestamp,
});
export type SchoolAccount = z.infer<typeof schoolAccountSchema>;
export const createSchoolAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: currencySchema,
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
