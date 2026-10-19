import type {
  AdmissionPreview,
  NewSchoolYearGroup,
  NewSchoolYearPreview,
  GuardianDetail,
  GuardianLink,
  StudentCounts,
  StudentDetail,
  StudentList,
  StudentRow,
} from '@eduvault/api-contract';
import { testId } from './test-api';
import { IKEJA, LEKKI } from './test-members';

export const STUDENT_ID = '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11';
export const ARM_ID = '6c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c55';
export const GUARDIAN_ID = '9a0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c66';
export const ARM_IKEJA_ID = '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c99';

export const SESSION_2026_ID = testId(0xc0_10);
export const SESSION_2025_ID = testId(0xc0_11);
export const TERM_FIRST_ID = testId(0xc0_12);
export const TERM_SECOND_ID = testId(0xc0_13);

export const TOBI_ID = testId(0xc0_20);
export const EFE_ID = testId(0xc0_21);
export const UCHE_ID = testId(0xc0_22);
export const OTHER_GUARDIAN_ID = testId(0xc0_23);
export const THIRD_GUARDIAN_ID = testId(0xc0_24);
export const DUPLICATE_STUDENT_ID = testId(0xc0_25);

export const YEAR_2027_ID = testId(0xc0_30);
export const YEAR_2026_ID = testId(0xc0_31);
export const TERM_2027_FIRST_ID = testId(0xc0_32);
export const LEVEL_JSS2_ID = testId(0xc0_33);
export const LEVEL_JSS3_ID = testId(0xc0_34);
export const LEVEL_SS3_ID = testId(0xc0_35);

export const studentRow = (
  overrides: Partial<StudentRow> = {}
): StudentRow => ({
  id: STUDENT_ID,
  firstName: 'Ada',
  lastName: 'Okeke',
  admissionNumber: 'GF-0123',
  life: 'active',
  dueLeft: false,
  isNewIntake: false,
  notSeenSince: null,
  notSeenBy: null,
  weeksAway: null,
  currentPlacement: {
    armId: ARM_ID,
    className: 'JSS 2 Gold',
    campusId: LEKKI.id,
    campusName: 'Lekki',
  },
  latestClassName: 'JSS 2 Gold',
  effectiveCampus: { id: LEKKI.id, name: 'Lekki' },
  admittedOn: '2025-09-08',
  exit: null,
  graduatedSessionName: null,
  ...overrides,
});

export const counts = (
  overrides: Partial<StudentCounts> = {}
): StudentCounts => ({
  active: 2,
  new: 1,
  inactive: 1,
  left: 1,
  graduated: 1,
  ...overrides,
});

export const studentList = (
  items: StudentRow[],
  overrides: Partial<StudentList> = {}
): StudentList => ({
  items,
  total: items.length,
  counts: counts(),
  startYear: null,
  ...overrides,
});

export const guardianLink = (
  overrides: Partial<GuardianLink> = {}
): GuardianLink => ({
  guardianId: GUARDIAN_ID,
  fullName: 'Ngozi Okeke',
  phone: '0803 456 7890',
  relationship: 'mother',
  paysFees: true,
  loginKind: 'email',
  email: 'ngozi@example.test',
  username: null,
  photoUrl: null,
  ...overrides,
});

export const guardianDetail = (
  overrides: Partial<GuardianDetail> = {}
): GuardianDetail => ({
  id: GUARDIAN_ID,
  fullName: 'Ngozi Okeke',
  phone: '0803 456 7890',
  email: 'ngozi@example.test',
  username: null,
  address: '12 Admiralty Way',
  photoUrl: null,
  paysFees: true,
  children: [
    {
      studentId: STUDENT_ID,
      name: 'Ada Okeke',
      relationship: 'mother',
      paysFees: true,
    },
  ],
  ...overrides,
});

export const studentDetail = (
  overrides: Partial<StudentDetail> = {}
): StudentDetail => ({
  ...studentRow(),
  gender: 'F',
  dateOfBirth: '2014-03-03',
  homeCampus: { id: LEKKI.id, name: 'Lekki' },
  portalLogin: { username: 'greenfield-0123', active: true },
  notSeenNote: null,
  archivedBy: null,
  history: [
    {
      sessionId: SESSION_2026_ID,
      sessionName: '2026/2027',
      levelName: 'JSS 2',
      status: 'active',
      isNew: false,
      placements: [
        {
          termName: 'First term',
          className: 'JSS 2 Gold',
          campusName: 'Lekki',
        },
      ],
    },
    {
      sessionId: SESSION_2025_ID,
      sessionName: '2025/2026',
      levelName: 'JSS 1',
      status: 'completed',
      isNew: true,
      placements: [
        {
          termName: 'First term',
          className: 'JSS 1 Gold',
          campusName: 'Lekki',
        },
      ],
    },
  ],
  nextTerm: null,
  canMoveForNextTerm: false,
  canUndoLeaving: false,
  guardians: [guardianLink()],
  ...overrides,
});

export const preview = (
  overrides: Partial<AdmissionPreview> = {}
): AdmissionPreview => ({
  nextAdmissionNumber: 'GF-0234',
  nextStudentUsername: 'greenfield-0234',
  currentTerm: { id: TERM_FIRST_ID, name: 'First term' },
  currentSession: { id: SESSION_2026_ID, name: '2026/2027' },
  nextTerm: null,
  maxGuardians: 4,
  requireGuardian: true,
  classes: [
    { id: ARM_ID, label: 'JSS 2 Gold · Lekki', campusId: LEKKI.id },
    {
      id: ARM_IKEJA_ID,
      label: 'JSS 2 Emerald · Ikeja',
      campusId: IKEJA.id,
    },
  ],
  ...overrides,
});

export const ARM_J3 = '8e0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c01';
export const ARM_SS3 = '8e0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c02';

const jssGroup = (): NewSchoolYearGroup => ({
  fromClass: {
    id: ARM_ID,
    name: 'JSS 2 Gold',
    campusName: 'Lekki',
    archived: false,
  },
  level: { id: LEVEL_JSS2_ID, name: 'JSS 2', isFinalYear: false },
  nextLevel: { id: LEVEL_JSS3_ID, name: 'JSS 3' },
  toClass: { id: ARM_J3, name: 'JSS 3 Gold', campusName: 'Lekki' },
  classChoices: [],
  repeatClassChoices: [],
  students: [
    {
      id: STUDENT_ID,
      firstName: 'Ada',
      lastName: 'Okeke',
      admissionNumber: 'GF-0123',
    },
    {
      id: TOBI_ID,
      firstName: 'Tobi',
      lastName: 'Lawal',
      admissionNumber: 'GF-0124',
    },
  ],
  inactive: [{ id: UCHE_ID, name: 'Uche Mba' }],
});

const finalYearGroup = (): NewSchoolYearGroup => ({
  fromClass: {
    id: ARM_SS3,
    name: 'SS 3 Blue',
    campusName: 'Ikeja',
    archived: false,
  },
  level: { id: LEVEL_SS3_ID, name: 'SS 3', isFinalYear: true },
  nextLevel: null,
  toClass: null,
  classChoices: [],
  repeatClassChoices: [],
  students: [
    {
      id: EFE_ID,
      firstName: 'Efe',
      lastName: 'Ade',
      admissionNumber: 'GF-0125',
    },
  ],
  inactive: [],
});

export const newSchoolYearPreview = (
  overrides: Partial<NewSchoolYearPreview> = {}
): NewSchoolYearPreview => ({
  targetYear: {
    id: YEAR_2027_ID,
    name: '2027/2028',
    firstTerm: { id: TERM_2027_FIRST_ID, name: 'First term', isCurrent: false },
  },
  leavingYear: { id: YEAR_2026_ID, name: '2026/2027' },
  canGraduate: true,
  alreadyInTargetYear: 0,
  groups: [jssGroup(), finalYearGroup()],
  ...overrides,
});
