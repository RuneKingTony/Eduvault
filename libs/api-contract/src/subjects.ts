import { z } from 'zod';
import { idSchema } from './schemas';

export const SUBJECT_PAGE_SIZE = 10;
export const SUBJECT_NAME_MAX = 80;
export const SUBJECT_CODE_MAX = 5;

export const SUBJECT_REQUIRED_MESSAGE = 'Enter a code and a name.';
export const SUBJECT_CODE_MESSAGE = 'Use up to 5 letters for the code.';
export const SUBJECT_NOT_FOUND_MESSAGE = 'Subject not found';
export const SUBJECT_TEACHER_NOT_FOUND_MESSAGE = 'Subject teacher not found';
export const SUBJECT_NO_CURRENT_TERM_MESSAGE =
  'Make a term current before choosing subject teachers.';
export const SUBJECT_NO_PREVIOUS_TERM_MESSAGE =
  'There is no earlier term to copy subject teachers from.';
export const SUBJECT_NOT_ON_LEVEL_MESSAGE =
  'That subject is not on this class’s level.';
export const LEVEL_SUBJECT_LEVEL_NOT_FOUND_MESSAGE = 'Level not found';

export const subjectCodeTakenMessage = (code: string): string =>
  `A subject with code ${code} already exists. Codes are unique per school.`;

export const subjectOnLevelMessage = (name: string): string =>
  `Take ${name} off every class level first.`;

export const subjectRetiredMessage = (name: string): string =>
  `${name} is retired. Restore it before assigning it.`;

export const subjectTeacherNotCandidateMessage = (campus: string): string =>
  `Only teachers on the ${campus} campus can teach this class.`;

export const subjectClassArchivedMessage = (display: string): string =>
  `${display} is archived. Restore it before choosing subject teachers.`;

const codeSchema = z
  .string()
  .trim()
  .min(1, SUBJECT_REQUIRED_MESSAGE)
  .regex(/^[a-z]{0,5}$/i, SUBJECT_CODE_MESSAGE)
  .transform((code) => code.toUpperCase());

const nameSchema = z
  .string()
  .trim()
  .min(1, SUBJECT_REQUIRED_MESSAGE)
  .max(SUBJECT_NAME_MAX, `Use ${SUBJECT_NAME_MAX} characters or fewer.`);

export const subjectSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  retiredAt: z.string().nullable(),
  levelCodes: z.array(z.string()),
});
export type Subject = z.infer<typeof subjectSchema>;

export const subjectListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  includeRetired: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});
export type SubjectListQuery = z.input<typeof subjectListQuerySchema>;

export const subjectListSchema = z.object({
  items: z.array(subjectSchema),
  total: z.number().int().nonnegative(),
});
export type SubjectList = z.infer<typeof subjectListSchema>;

export const createSubjectSchema = z.object({
  code: codeSchema,
  name: nameSchema,
});
export type CreateSubjectInput = z.input<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: nameSchema.optional(),
  retired: z.boolean().optional(),
});
export type UpdateSubjectInput = z.input<typeof updateSubjectSchema>;

export const levelSubjectKindSchema = z.enum(['core', 'elective']);
export type LevelSubjectKind = z.infer<typeof levelSubjectKindSchema>;

export const levelSubjectSchema = z.object({
  classLevelId: idSchema,
  subjectId: idSchema,
  subjectCode: z.string(),
  subjectName: z.string(),
  kind: levelSubjectKindSchema,
  sequence: z.number().int().min(1),
});
export type LevelSubject = z.infer<typeof levelSubjectSchema>;

export const levelSubjectListQuerySchema = z.object({
  classLevelId: idSchema.optional(),
});
export type LevelSubjectListQuery = z.input<typeof levelSubjectListQuerySchema>;

export const subjectTeacherSchema = z.object({
  userId: idSchema,
  name: z.string(),
});
export type SubjectTeacherPerson = z.infer<typeof subjectTeacherSchema>;

export const subjectTeacherRowSchema = z.object({
  subjectId: idSchema,
  code: z.string(),
  name: z.string(),
  kind: levelSubjectKindSchema,
  teacher: subjectTeacherSchema.nullable(),
});
export type SubjectTeacherRow = z.infer<typeof subjectTeacherRowSchema>;

export const subjectTeacherArmSchema = z.object({
  classId: idSchema,
  displayName: z.string(),
  campus: z.object({ id: idSchema, name: z.string() }),
  subjects: z.array(subjectTeacherRowSchema),
});
export type SubjectTeacherArm = z.infer<typeof subjectTeacherArmSchema>;

const termRefSchema = z.object({ id: idSchema, name: z.string() });

export const subjectTeachersSchema = z.object({
  term: termRefSchema.nullable(),
  arms: z.array(subjectTeacherArmSchema),
  copyFrom: termRefSchema.nullable(),
});
export type SubjectTeachers = z.infer<typeof subjectTeachersSchema>;

export const classSubjectParamsSchema = z.object({
  id: idSchema,
  subjectId: idSchema,
});

export const assignSubjectTeacherSchema = z.object({ userId: idSchema });
export type AssignSubjectTeacherInput = z.input<
  typeof assignSubjectTeacherSchema
>;

export const assignedSubjectTeacherSchema = subjectTeacherSchema.extend({
  classId: idSchema,
  subjectId: idSchema,
  termId: idSchema,
});
export type AssignedSubjectTeacher = z.infer<
  typeof assignedSubjectTeacherSchema
>;

export const subjectTeacherRemovedSchema = z.object({
  classId: idSchema,
  subjectId: idSchema,
});
export type SubjectTeacherRemoved = z.infer<typeof subjectTeacherRemovedSchema>;

export const copySkipReasonSchema = z.enum([
  'subjectNotOnLevel',
  'subjectRetired',
  'notCandidate',
]);
export type CopySkipReason = z.infer<typeof copySkipReasonSchema>;

export const subjectTeachersCopiedSchema = z.object({
  copied: z.number().int().nonnegative(),
  skipped: z.array(
    z.object({
      classId: idSchema,
      subjectId: idSchema,
      reason: copySkipReasonSchema,
    })
  ),
  from: termRefSchema,
});
export type SubjectTeachersCopied = z.infer<typeof subjectTeachersCopiedSchema>;
