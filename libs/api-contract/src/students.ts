import { z } from 'zod';
import {
  guardianDraftSchema,
  guardianLinkSchema,
  loginCredentialSchema,
} from './guardians';
import { idSchema } from './schemas';

const dateSchema = z.iso.date();

export const STUDENT_PAGE_SIZE = 10;
export const STUDENT_MAX_PAGE_SIZE = 100;
export const STUDENT_NAME_MAX = 80;

export const STUDENT_NOT_FOUND_MESSAGE = 'Student not found';
export const ADMIT_FIRST_NAME_REQUIRED = 'Enter the first name.';
export const ADMIT_LAST_NAME_REQUIRED = 'Enter the last name.';
export const ADMIT_DOB_MESSAGE = 'Choose a date of birth on or before today.';
export const ADMIT_NO_TERM_MESSAGE =
  'Set a current term before admitting students.';
export const ADMIT_NO_CLASSES_MESSAGE =
  'No classes on your campuses yet. Add a class first.';
export const ADMIT_REQUIRE_GUARDIAN_MESSAGE =
  'Add at least one guardian, or switch off “Guardian needed to admit” in Admissions rules.';
export const ADMIT_LOGIN_NOTE =
  'They choose their own password the first time they sign in to the portal.';

export const STUDENT_TABS = [
  'active',
  'new',
  'inactive',
  'left',
  'graduated',
] as const;
export const studentTabSchema = z.enum(STUDENT_TABS);
export type StudentTab = z.infer<typeof studentTabSchema>;

export const studentLifeSchema = z.enum([
  'active',
  'inactive',
  'left',
  'graduated',
]);
export type StudentLife = z.infer<typeof studentLifeSchema>;

export const studentListQuerySchema = z.object({
  tab: studentTabSchema.default('active'),
  q: z.string().trim().max(120).optional(),
  campusId: idSchema.optional(),
  levelId: idSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(STUDENT_MAX_PAGE_SIZE)
    .default(STUDENT_PAGE_SIZE),
});
export type StudentListQuery = z.input<typeof studentListQuerySchema>;

const namedRefSchema = z.object({ id: z.string(), name: z.string() });

export const studentRowSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  admissionNumber: z.string(),
  life: studentLifeSchema,
  dueLeft: z.boolean(),
  isNewIntake: z.boolean(),
  notSeenSince: dateSchema.nullable(),
  notSeenBy: namedRefSchema.nullable(),
  weeksAway: z.number().int().nonnegative().nullable(),
  currentPlacement: z
    .object({
      armId: idSchema,
      className: z.string(),
      campusId: z.string(),
      campusName: z.string(),
    })
    .nullable(),
  latestClassName: z.string().nullable(),
  effectiveCampus: namedRefSchema,
  admittedOn: dateSchema,
  exit: z
    .object({
      kind: z.enum(['left', 'graduated']),
      on: dateSchema.nullable(),
      reason: z.string(),
      note: z.string().nullable(),
      recordedOn: z.string(),
    })
    .nullable(),
  graduatedSessionName: z.string().nullable(),
  payers: z.array(z.string()).optional(),
});
export type StudentRow = z.infer<typeof studentRowSchema>;

export const studentCountsSchema = z.object({
  active: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  inactive: z.number().int().nonnegative(),
  left: z.number().int().nonnegative(),
  graduated: z.number().int().nonnegative(),
});
export type StudentCounts = z.infer<typeof studentCountsSchema>;

export const studentListSchema = z.object({
  items: z.array(studentRowSchema),
  total: z.number().int().nonnegative(),
  counts: studentCountsSchema,
  startYear: z.object({ targetYearId: idSchema, name: z.string() }).nullable(),
});
export type StudentList = z.infer<typeof studentListSchema>;

export const enrollmentStatusSchema = z.enum([
  'active',
  'withdrawn',
  'completed',
]);

export const studentHistorySchema = z.object({
  sessionId: idSchema,
  sessionName: z.string(),
  levelName: z.string(),
  status: enrollmentStatusSchema,
  isNew: z.boolean(),
  placements: z.array(
    z.object({
      termName: z.string(),
      className: z.string(),
      campusName: z.string(),
    })
  ),
});
export type StudentHistory = z.infer<typeof studentHistorySchema>;

export const studentDetailSchema = studentRowSchema.extend({
  gender: z.enum(['F', 'M']),
  dateOfBirth: dateSchema,
  homeCampus: namedRefSchema,
  portalLogin: z
    .object({ username: z.string(), active: z.boolean() })
    .nullable(),
  notSeenNote: z.string().nullable(),
  archivedBy: namedRefSchema.nullable(),
  history: z.array(studentHistorySchema),
  nextTerm: z.object({ id: idSchema, name: z.string() }).nullable(),
  canMoveForNextTerm: z.boolean(),
  canUndoLeaving: z.boolean(),
  guardians: z.array(guardianLinkSchema).optional(),
});
export type StudentDetail = z.infer<typeof studentDetailSchema>;

const studentNameSchema = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(STUDENT_NAME_MAX, `Use ${STUDENT_NAME_MAX} characters or fewer.`);

const genderSchema = z.enum(['F', 'M']);
const dateOfBirthSchema = z.iso.date({ error: ADMIT_DOB_MESSAGE });

export const admitStudentSchema = z.object({
  firstName: studentNameSchema(ADMIT_FIRST_NAME_REQUIRED),
  lastName: studentNameSchema(ADMIT_LAST_NAME_REQUIRED),
  gender: genderSchema,
  dateOfBirth: dateOfBirthSchema,
  classArmId: idSchema,
  guardians: z.array(guardianDraftSchema).max(6).default([]),
});
export type AdmitStudentInput = z.input<typeof admitStudentSchema>;
export type AdmitStudent = z.output<typeof admitStudentSchema>;

export const admitStudentResultSchema = z.object({
  student: studentDetailSchema,
  logins: z.array(loginCredentialSchema),
});
export type AdmitStudentResult = z.infer<typeof admitStudentResultSchema>;

export const updateStudentSchema = z.strictObject({
  firstName: studentNameSchema(ADMIT_FIRST_NAME_REQUIRED).optional(),
  lastName: studentNameSchema(ADMIT_LAST_NAME_REQUIRED).optional(),
  gender: genderSchema.optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
});
export type UpdateStudentInput = z.output<typeof updateStudentSchema>;

export const admissionClassOptionSchema = z.object({
  id: idSchema,
  label: z.string(),
  campusId: z.string(),
});
export type AdmissionClassOption = z.infer<typeof admissionClassOptionSchema>;

export const admissionPreviewSchema = z.object({
  nextAdmissionNumber: z.string(),
  nextStudentUsername: z.string(),
  currentTerm: z.object({ id: idSchema, name: z.string() }),
  currentSession: z.object({ id: idSchema, name: z.string() }),
  maxGuardians: z.number().int().min(1),
  requireGuardian: z.boolean(),
  classes: z.array(admissionClassOptionSchema),
});
export type AdmissionPreview = z.infer<typeof admissionPreviewSchema>;

export const admissionDuplicatesQuerySchema = z.object({
  firstName: studentNameSchema(ADMIT_FIRST_NAME_REQUIRED),
  lastName: studentNameSchema(ADMIT_LAST_NAME_REQUIRED),
  dateOfBirth: dateOfBirthSchema,
});
export type AdmissionDuplicatesQuery = z.input<
  typeof admissionDuplicatesQuerySchema
>;

export const admissionDuplicatesSchema = z.object({
  matches: z.array(
    z.object({
      name: z.string(),
      state: z.string(),
      studentId: idSchema.optional(),
      admissionNumber: z.string().optional(),
    })
  ),
});
export type AdmissionDuplicates = z.infer<typeof admissionDuplicatesSchema>;
