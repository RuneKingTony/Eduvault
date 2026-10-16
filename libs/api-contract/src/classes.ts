import { z } from 'zod';
import { idSchema } from './schemas';

export const CLASS_LEVEL_CODE_MESSAGE =
  'Use 2 to 8 capital letters or digits, for example JSS1.';
export const CLASS_LEVEL_NAME_REQUIRED = 'Give the level a name.';
export const CLASS_LEVEL_NAME_MAX = 40;
export const CLASS_NAME_REQUIRED = 'Give the class a name, for example Gold.';
export const CLASS_NAME_MAX = 40;

export const CLASS_LEVEL_SELF_NEXT_MESSAGE = 'A level can’t lead to itself.';
export const CLASS_LEVEL_NOT_FOUND_MESSAGE = 'Level not found';
export const CLASS_NOT_FOUND_MESSAGE = 'Class not found';
export const CLASS_MEMBER_NOT_FOUND_MESSAGE = 'Member not found';
export const CLASS_TEACHER_NOT_FOUND_MESSAGE = 'Class teacher not found';
export const CLASS_NO_CURRENT_TERM_MESSAGE =
  'Make a term current before adding class teachers.';

export const classLevelExistsMessage = (code: string): string =>
  `${code} already exists.`;

export const classExistsMessage = (display: string, campus: string): string =>
  `${display} already exists on ${campus}.`;

export const CLASS_NAME_TAKEN_MESSAGE = 'That class name is already taken.';

export const classArchivedExistsMessage = (
  display: string,
  campus: string
): string =>
  `${display} already exists on ${campus} and is archived. Restore it instead.`;

export const classTeacherNotCandidateMessage = (campus: string): string =>
  `Only teachers on the ${campus} campus can be class teachers of this class.`;

export const classTeacherRepeatMessage = (
  name: string,
  display: string
): string => `${name} is already a class teacher of ${display}.`;

export const classHasLeadMessage = (display: string, name: string): string =>
  `${display} already has a lead class teacher: ${name}.`;

export const classArchivedTeachersMessage = (display: string): string =>
  `${display} is archived. Restore it before adding teachers.`;

export const classHasPlacementsMessage = (display: string): string =>
  `Students are placed in ${display} this term or later, so it can’t be archived yet.`;

export const classLevelSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  sequence: z.number().int().min(1),
  nextLevelId: idSchema.nullable(),
  isFinalYear: z.boolean(),
});
export type ClassLevel = z.infer<typeof classLevelSchema>;

export const createClassLevelSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{2,8}$/, CLASS_LEVEL_CODE_MESSAGE),
  name: z
    .string()
    .trim()
    .min(1, CLASS_LEVEL_NAME_REQUIRED)
    .max(
      CLASS_LEVEL_NAME_MAX,
      `Use ${CLASS_LEVEL_NAME_MAX} characters or fewer.`
    ),
  nextLevelId: idSchema.nullish(),
});
export type CreateClassLevelInput = z.input<typeof createClassLevelSchema>;

export const updateClassLevelSchema = z.object({
  name: createClassLevelSchema.shape.name.optional(),
  sequence: z.number().int().min(1).optional(),
  nextLevelId: idSchema.nullable().optional(),
});
export type UpdateClassLevelInput = z.input<typeof updateClassLevelSchema>;

export const classTeacherRoleSchema = z.enum(['lead', 'assistant', 'uniform']);
export type ClassTeacherRole = z.infer<typeof classTeacherRoleSchema>;

export const classTeacherSchema = z.object({
  userId: idSchema,
  name: z.string(),
  role: classTeacherRoleSchema,
});
export type ClassTeacher = z.infer<typeof classTeacherSchema>;

export const classSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  displayName: z.string(),
  level: z.object({ id: idSchema, code: z.string(), name: z.string() }),
  campus: z.object({ id: idSchema, name: z.string() }),
  classTeachers: z.array(classTeacherSchema),
  studentCount: z.number().int().nonnegative(),
  retiredAt: z.string().nullable(),
});
export type ClassSummary = z.infer<typeof classSummarySchema>;

export const rosterRowSchema = z.object({
  studentId: idSchema,
  name: z.string(),
  admissionNumber: z.string(),
});
export type RosterRow = z.infer<typeof rosterRowSchema>;

export const classDetailSchema = classSummarySchema.extend({
  isFinalYear: z.boolean(),
  roster: z.array(rosterRowSchema).nullable(),
});
export type ClassDetail = z.infer<typeof classDetailSchema>;

export const teacherCandidateSchema = z.object({
  userId: idSchema,
  name: z.string(),
});
export type TeacherCandidate = z.infer<typeof teacherCandidateSchema>;

export const teacherCandidatesQuerySchema = z.object({
  for: z.enum(['class', 'subject']).default('class'),
});
export type TeacherCandidatesQuery = z.input<
  typeof teacherCandidatesQuerySchema
>;

export const classStatusSchema = z.enum(['active', 'archived', 'all']);
export type ClassStatus = z.infer<typeof classStatusSchema>;

export const classListQuerySchema = z.object({
  campusId: idSchema.optional(),
  levelId: idSchema.optional(),
  status: classStatusSchema.default('active'),
});
export type ClassListQuery = z.input<typeof classListQuerySchema>;

const classNameSchema = z
  .string()
  .trim()
  .min(1, CLASS_NAME_REQUIRED)
  .max(CLASS_NAME_MAX, `Use ${CLASS_NAME_MAX} characters or fewer.`);

export const createClassSchema = z.object({
  levelId: idSchema,
  campusId: idSchema,
  name: classNameSchema,
});
export type CreateClassInput = z.input<typeof createClassSchema>;

export const updateClassSchema = z.object({
  name: classNameSchema.optional(),
  archived: z.boolean().optional(),
});
export type UpdateClassInput = z.input<typeof updateClassSchema>;

export const assignClassTeacherSchema = z.object({
  userId: idSchema,
  role: classTeacherRoleSchema,
});
export type AssignClassTeacherInput = z.input<typeof assignClassTeacherSchema>;

export const classTeacherParamsSchema = z.object({
  id: idSchema,
  userId: idSchema,
});

export const classTeacherRemovedSchema = z.object({
  classId: idSchema,
  userId: idSchema,
});
export type ClassTeacherRemoved = z.infer<typeof classTeacherRemovedSchema>;

export const GRADUATE_NONE_MESSAGE = 'Tick at least one student.';

export const graduateNotFinalYearMessage = (display: string): string =>
  `${display} is not a final-year class.`;

export const GRADUATE_NOT_ON_ROSTER_MESSAGE =
  'Every ticked student must be on this class’s roster this term.';

export const graduateClassSchema = z.object({
  studentIds: z.array(idSchema).min(1, GRADUATE_NONE_MESSAGE),
});
export type GraduateClassInput = z.input<typeof graduateClassSchema>;

export const classGraduatedSchema = z.object({
  graduated: z.number().int().nonnegative(),
});
export type ClassGraduated = z.infer<typeof classGraduatedSchema>;
