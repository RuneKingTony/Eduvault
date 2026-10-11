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

export const STUDENT_NOTE_MAX = 500;

export const LEAVING_REASONS = [
  { code: 'did_not_return', label: 'Did not return' },
  { code: 'relocated', label: 'Relocated' },
  { code: 'transferred', label: 'Transferred to another school' },
  { code: 'fees', label: 'Fees' },
  { code: 'expelled', label: 'Expelled' },
  { code: 'other', label: 'Other' },
] as const;

export type LeavingReason = (typeof LEAVING_REASONS)[number]['code'];

export const leavingReasonLabel = (code: string): string =>
  LEAVING_REASONS.find((reason) => reason.code === code)?.label ?? 'Other';

export const leavingReasonSchema = z.enum(
  LEAVING_REASONS.map((reason) => reason.code)
);

export const MARK_AWAY_FUTURE_MESSAGE = 'Choose a date on or before today.';
export const LEAVE_FUTURE_MESSAGE = 'Choose a last day on or before today.';
export const LEAVE_NO_CURRENT_TERM_MESSAGE =
  'Make a term current before recording a leaving.';
export const MOVE_NO_NEXT_TERM_MESSAGE =
  'There is no next term in this school year.';
export const MOVE_NOT_NEXT_TERM_MESSAGE = 'Choose the next term.';
export const MOVE_NO_ENROLMENT_MESSAGE =
  'This student has no enrolment in the current school year.';
export const START_NOTHING_MESSAGE =
  'There is no school year to start. Create the next school year first.';
export const START_WRONG_YEAR_MESSAGE =
  'That is not the school year to start now.';
export const START_NO_CURRENT_TERM_MESSAGE =
  'Make a term current before starting a school year.';
export const START_NO_ROWS_MESSAGE = 'Choose at least one student.';
export const START_CLASS_REQUIRED_MESSAGE = 'Choose a class.';
export const START_DUPLICATE_ROW_MESSAGE = 'List each student once.';
export const START_FINAL_YEAR_MOVE_MESSAGE =
  'Final-year students graduate; they cannot move up.';
export const START_NOT_FINAL_YEAR_GRADUATE_MESSAGE =
  'Only final-year students can graduate.';
export const GRADUATE_NO_CURRENT_TERM_MESSAGE =
  'Make a term current before graduating students.';

export const studentGoneMessage = (name: string): string =>
  `${name} is no longer on the roll.`;

export const studentNotMarkedMessage = (name: string): string =>
  `${name} is not marked as not seen.`;

export const studentOnRollMessage = (name: string): string =>
  `${name} is still on the roll.`;

export const alreadyMarkedMessage = (date: string): string =>
  `Already marked not seen since ${date}.`;

export const markAwayBeforeAdmittedMessage = (admitted: string): string =>
  `Choose a date on or after ${admitted}.`;

export const undoWindowMessage = (kind: 'left' | 'graduated'): string =>
  `A ${kind === 'left' ? 'leaving' : 'graduation'} can only be undone in the term it was recorded.`;

export const moveHasPlacementMessage = (name: string, term: string): string =>
  `${name} already has a ${term} placement.`;

export const chooseLevelClassMessage = (level: string): string =>
  `Choose a ${level} class.`;

export const archivedClassMessage = (display: string): string =>
  `${display} is archived. Choose another class.`;

export const chooseClassForGroupMessage = (
  className: string,
  campus: string
): string => `Choose a class for ${className} (${campus}).`;

const noteSchema = z
  .string()
  .trim()
  .max(STUDENT_NOTE_MAX, `Use ${STUDENT_NOTE_MAX} characters or fewer.`);

export const markAwaySchema = z.object({
  date: z.iso.date({ error: MARK_AWAY_FUTURE_MESSAGE }),
  note: noteSchema.optional(),
});
export type MarkAwayInput = z.input<typeof markAwaySchema>;

export const leaveSchema = z.object({
  reason: leavingReasonSchema,
  lastDay: z.iso.date({ error: LEAVE_FUTURE_MESSAGE }),
  note: noteSchema.optional(),
});
export type LeaveInput = z.input<typeof leaveSchema>;

export const placeStudentSchema = z.object({
  termId: idSchema,
  classArmId: idSchema,
});
export type PlaceStudentInput = z.input<typeof placeStudentSchema>;

export const placementClassSchema = z.object({
  id: idSchema,
  name: z.string(),
  campus: z.object({ id: idSchema, name: z.string() }),
});
export type PlacementClass = z.infer<typeof placementClassSchema>;

export const NEW_SCHOOL_YEAR_OUTCOMES = ['move', 'repeat', 'graduate'] as const;
export const newSchoolYearOutcomeSchema = z.enum(NEW_SCHOOL_YEAR_OUTCOMES);
export type NewSchoolYearOutcome = z.infer<typeof newSchoolYearOutcomeSchema>;

const classChoiceSchema = z.object({
  id: idSchema,
  name: z.string(),
  campusName: z.string(),
});
export type ClassChoice = z.infer<typeof classChoiceSchema>;

export const newSchoolYearGroupSchema = z.object({
  fromClass: z
    .object({
      id: idSchema,
      name: z.string(),
      campusName: z.string(),
      archived: z.boolean(),
    })
    .nullable(),
  level: z.object({
    id: idSchema,
    name: z.string(),
    isFinalYear: z.boolean(),
  }),
  nextLevel: z.object({ id: idSchema, name: z.string() }).nullable(),
  toClass: classChoiceSchema.nullable(),
  classChoices: z.array(classChoiceSchema),
  repeatClassChoices: z.array(classChoiceSchema),
  students: z.array(
    z.object({
      id: idSchema,
      firstName: z.string(),
      lastName: z.string(),
      admissionNumber: z.string(),
    })
  ),
  inactive: z.array(z.object({ id: idSchema, name: z.string() })),
});
export type NewSchoolYearGroup = z.infer<typeof newSchoolYearGroupSchema>;

export const newSchoolYearPreviewSchema = z.object({
  targetYear: z.object({
    id: idSchema,
    name: z.string(),
    firstTerm: z.object({
      id: idSchema,
      name: z.string(),
      isCurrent: z.boolean(),
    }),
  }),
  leavingYear: z.object({ id: idSchema, name: z.string() }),
  canGraduate: z.boolean(),
  alreadyInTargetYear: z.number().int().nonnegative(),
  groups: z.array(newSchoolYearGroupSchema),
});
export type NewSchoolYearPreview = z.infer<typeof newSchoolYearPreviewSchema>;

export const newSchoolYearRowSchema = z
  .object({
    studentId: idSchema,
    outcome: newSchoolYearOutcomeSchema,
    classArmId: idSchema.optional(),
  })
  .refine((row) => row.outcome === 'graduate' || row.classArmId !== undefined, {
    error: START_CLASS_REQUIRED_MESSAGE,
    path: ['classArmId'],
  });
export type NewSchoolYearRow = z.infer<typeof newSchoolYearRowSchema>;

export const startNewSchoolYearSchema = z.object({
  targetYearId: idSchema,
  rows: z
    .array(newSchoolYearRowSchema)
    .min(1, START_NO_ROWS_MESSAGE)
    .max(10_000),
});
export type StartNewSchoolYearInput = z.input<typeof startNewSchoolYearSchema>;

export const startNewSchoolYearResultSchema = z.object({
  moved: z.number().int().nonnegative(),
  repeating: z.number().int().nonnegative(),
  graduated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type StartNewSchoolYearResult = z.infer<
  typeof startNewSchoolYearResultSchema
>;
