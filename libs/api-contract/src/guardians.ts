import { z } from 'zod';
import { idSchema } from './schemas';

export const GUARDIAN_NAME_MAX = 120;
export const GUARDIAN_ADDRESS_MAX = 200;
export const GUARDIAN_PHONE_PATTERN = /^[\d +-]{7,20}$/;
export const GUARDIAN_PHOTO_MAX_BYTES = 1_048_576;
export const GUARDIAN_PHOTO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const GUARDIAN_NAME_REQUIRED = 'Enter the guardian’s full name.';
export const GUARDIAN_PHONE_REQUIRED = 'Enter a phone number.';
export const GUARDIAN_ADDRESS_REQUIRED = 'Enter the house address.';
export const GUARDIAN_EMAIL_INVALID = 'Enter a valid email.';
export const GUARDIAN_NOT_FOUND_MESSAGE = 'Guardian not found';
export const GUARDIAN_PICK_MESSAGE =
  'Choose the existing guardian, or switch to New guardian.';
export const GUARDIAN_TWICE_MESSAGE = 'The same guardian is chosen twice.';
export const GUARDIAN_ALREADY_LINKED_MESSAGE =
  'That guardian is already linked to this student.';
export const GUARDIAN_NO_PAYER_MESSAGE =
  'At least one guardian must pay the school fees.';
export const GUARDIAN_LAST_REQUIRED_MESSAGE =
  'A student needs at least one guardian. Add another guardian first.';
export const GUARDIAN_PHOTO_TYPE_MESSAGE = 'Choose a PNG, JPG or WebP photo.';
export const GUARDIAN_PHOTO_SIZE_MESSAGE =
  'That photo is over 1 MB. Please choose a smaller one.';
export const GUARDIAN_PHOTO_INVALID_MESSAGE =
  'That photo can’t be used. Upload it again.';
export const GUARDIAN_STAFF_RESET_MESSAGE =
  'This guardian also works at the school. Reset their password from Staff.';
export const GUARDIAN_SHARED_RESET_MESSAGE =
  'This login is also used outside this school, so it can’t be reset from here.';
export const GUARDIAN_PERMISSION_LINK_MESSAGE =
  'You can’t link guardians. Someone with guardian permissions can add them from the student’s row.';

export const maxGuardiansMessage = (max: number): string =>
  `A student can have at most ${max} ${max === 1 ? 'guardian' : 'guardians'}.`;

export const guardianEmailTakenMessage = (
  email: string,
  name: string
): string =>
  `${email} already belongs to ${name}. Link the existing guardian instead.`;

export const GUARDIAN_RELATIONSHIPS = ['mother', 'father', 'guardian'] as const;
export const guardianRelationshipSchema = z.enum(GUARDIAN_RELATIONSHIPS);
export type GuardianRelationship = z.infer<typeof guardianRelationshipSchema>;

export const GUARDIAN_RELATIONSHIP_LABELS: Record<
  GuardianRelationship,
  string
> = { mother: 'Mother', father: 'Father', guardian: 'Guardian' };

const guardianNameSchema = z
  .string({ error: GUARDIAN_NAME_REQUIRED })
  .trim()
  .min(1, GUARDIAN_NAME_REQUIRED)
  .max(GUARDIAN_NAME_MAX, `Use ${GUARDIAN_NAME_MAX} characters or fewer.`);

const guardianPhoneSchema = z
  .string({ error: GUARDIAN_PHONE_REQUIRED })
  .trim()
  .regex(GUARDIAN_PHONE_PATTERN, GUARDIAN_PHONE_REQUIRED);

const guardianAddressSchema = z
  .string({ error: GUARDIAN_ADDRESS_REQUIRED })
  .trim()
  .min(1, GUARDIAN_ADDRESS_REQUIRED)
  .max(
    GUARDIAN_ADDRESS_MAX,
    `Use ${GUARDIAN_ADDRESS_MAX} characters or fewer.`
  );

export const guardianLoginInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('email'),
    email: z
      .string({ error: GUARDIAN_EMAIL_INVALID })
      .trim()
      .toLowerCase()
      .pipe(z.email(GUARDIAN_EMAIL_INVALID)),
  }),
  z.object({ kind: z.literal('username') }),
]);
export type GuardianLoginInput = z.output<typeof guardianLoginInputSchema>;

export const newGuardianSchema = z.object({
  fullName: guardianNameSchema,
  phone: guardianPhoneSchema,
  address: guardianAddressSchema,
  relationship: guardianRelationshipSchema,
  paysFees: z.boolean().default(false),
  photoFileId: idSchema.nullish(),
  login: guardianLoginInputSchema,
});
export type NewGuardian = z.output<typeof newGuardianSchema>;
export type NewGuardianInput = z.input<typeof newGuardianSchema>;

export const existingGuardianSchema = z.object({
  existingGuardianId: idSchema,
  relationship: guardianRelationshipSchema,
  paysFees: z.boolean().default(false),
});
export type ExistingGuardian = z.output<typeof existingGuardianSchema>;
export type ExistingGuardianInput = z.input<typeof existingGuardianSchema>;

export const guardianDraftSchema = z.union([
  existingGuardianSchema,
  z.object({ new: newGuardianSchema }),
]);
export type GuardianDraft = z.output<typeof guardianDraftSchema>;
export type GuardianDraftInput = z.input<typeof guardianDraftSchema>;

export const guardianSummarySchema = z.object({
  id: idSchema,
  fullName: z.string(),
  phone: z.string().optional(),
  childFirstNames: z.array(z.string()).optional(),
  outsideScope: z.boolean(),
});
export type GuardianSummary = z.infer<typeof guardianSummarySchema>;

export const guardianListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  excludeStudentId: idSchema.optional(),
});

export const guardianLoginKindSchema = z.enum(['email', 'username']);
export type GuardianLoginKind = z.infer<typeof guardianLoginKindSchema>;

export const guardianLinkSchema = z.object({
  guardianId: idSchema,
  fullName: z.string(),
  phone: z.string(),
  relationship: guardianRelationshipSchema,
  paysFees: z.boolean(),
  loginKind: guardianLoginKindSchema,
  email: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().nullable(),
});
export type GuardianLink = z.infer<typeof guardianLinkSchema>;

export const guardianChildSchema = z.object({
  studentId: idSchema,
  name: z.string(),
  relationship: guardianRelationshipSchema,
  paysFees: z.boolean(),
});
export type GuardianChild = z.infer<typeof guardianChildSchema>;

export const guardianDetailSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  address: z.string().nullable(),
  photoUrl: z.string().nullable(),
  paysFees: z.boolean(),
  children: z.array(guardianChildSchema),
});
export type GuardianDetail = z.infer<typeof guardianDetailSchema>;

export const editGuardianSchema = z.strictObject({
  fullName: guardianNameSchema.optional(),
  phone: guardianPhoneSchema.optional(),
  address: guardianAddressSchema.optional(),
  photoFileId: idSchema.nullable().optional(),
});
export type EditGuardianInput = z.output<typeof editGuardianSchema>;

export const updateGuardianLinkSchema = z.strictObject({
  relationship: guardianRelationshipSchema.optional(),
  paysFees: z.boolean().optional(),
});
export type UpdateGuardianLinkInput = z.output<typeof updateGuardianLinkSchema>;

export const guardianLinkParamsSchema = z.object({
  id: idSchema,
  guardianId: idSchema,
});

export const guardianUnlinkedSchema = z.object({
  studentId: idSchema,
  guardianId: idSchema,
});
export type GuardianUnlinked = z.infer<typeof guardianUnlinkedSchema>;

export const loginCredentialSchema = z.object({
  who: z.enum(['student', 'guardian']),
  name: z.string(),
  guardianId: idSchema.optional(),
  relationship: guardianRelationshipSchema.optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  temporaryPassword: z.string().optional(),
  existing: z.boolean(),
});
export type LoginCredential = z.infer<typeof loginCredentialSchema>;

export const linkGuardianResultSchema = z.object({
  link: guardianLinkSchema,
  login: loginCredentialSchema.optional(),
});
export type LinkGuardianResult = z.infer<typeof linkGuardianResultSchema>;

export const resetLoginSchema = z.object({
  username: z.string().optional(),
  email: z.string().optional(),
  temporaryPassword: z.string(),
});
export type ResetLogin = z.infer<typeof resetLoginSchema>;
