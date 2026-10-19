import type {
  ElectiveList,
  ElectiveStudent,
  LevelSubject,
  Subject,
  SubjectTeacherArm,
  SubjectTeachers,
} from '@eduvault/api-contract';
import { testId } from './test-api';

export const SUBJECT_IDS = {
  maths: testId(0x1_00_64),
  english: testId(0x1_00_65),
  agr: testId(0x1_00_66),
  french: testId(0x1_00_67),
  music: testId(0x1_00_68),
  jss1: testId(0x1_00_c8),
  jss2: testId(0x1_00_c9),
  session: testId(0x1_00_96),
  ada: testId(0x1_00_8c),
  bola: testId(0x1_00_8d),
  chi: testId(0x1_00_8e),
  gold: testId(0x1_00_6e),
  silver: testId(0x1_00_6f),
  lekki: testId(0x1_00_0a),
  emeka: testId(0x1_00_78),
  ayo: testId(0x1_00_79),
  term: testId(0x1_00_82),
  previous: testId(0x1_00_83),
} as const;

export const subject = (overrides: Partial<Subject> = {}): Subject => ({
  id: SUBJECT_IDS.maths,
  code: 'MTH',
  name: 'Mathematics',
  retiredAt: null,
  levelCodes: ['JSS1', 'JSS2'],
  ...overrides,
});

export const arm = (
  overrides: Partial<SubjectTeacherArm> = {}
): SubjectTeacherArm => ({
  classId: SUBJECT_IDS.gold,
  displayName: 'JSS 2 Gold',
  campus: { id: SUBJECT_IDS.lekki, name: 'Lekki' },
  subjects: [
    {
      subjectId: SUBJECT_IDS.maths,
      code: 'MTH',
      name: 'Mathematics',
      kind: 'core',
      teacher: { userId: SUBJECT_IDS.emeka, name: 'Emeka Obi' },
    },
    {
      subjectId: SUBJECT_IDS.english,
      code: 'ENG',
      name: 'English Language',
      kind: 'core',
      teacher: null,
    },
  ],
  ...overrides,
});

export const subjectTeachers = (
  overrides: Partial<SubjectTeachers> = {}
): SubjectTeachers => ({
  term: { id: SUBJECT_IDS.term, name: 'First term' },
  arms: [arm()],
  copyFrom: null,
  ...overrides,
});

export const levelRow = (
  overrides: Partial<LevelSubject> = {}
): LevelSubject => ({
  classLevelId: SUBJECT_IDS.jss2,
  subjectId: SUBJECT_IDS.maths,
  subjectCode: 'MTH',
  subjectName: 'Mathematics',
  kind: 'core',
  sequence: 1,
  takerCount: 0,
  ...overrides,
});

const electiveStudent = (
  overrides: Partial<ElectiveStudent> = {}
): ElectiveStudent => ({
  id: SUBJECT_IDS.ada,
  name: 'Ada Obi',
  admissionNumber: 'GF-0123',
  classId: SUBJECT_IDS.gold,
  className: 'JSS 2 Gold',
  classLevelId: SUBJECT_IDS.jss2,
  ...overrides,
});

export const electiveList = (
  overrides: Partial<ElectiveList> = {}
): ElectiveList => ({
  session: { id: SUBJECT_IDS.session, name: '2026/2027' },
  electives: [
    {
      subjectId: SUBJECT_IDS.french,
      studentIds: [SUBJECT_IDS.ada],
    },
    { subjectId: SUBJECT_IDS.music, studentIds: [] },
  ],
  students: [
    electiveStudent(),
    electiveStudent({
      id: SUBJECT_IDS.bola,
      name: 'Bola Ade',
      admissionNumber: 'GF-0124',
      classId: SUBJECT_IDS.silver,
      className: 'JSS 2 Silver',
    }),
    electiveStudent({
      id: SUBJECT_IDS.chi,
      name: 'Chi Ude',
      admissionNumber: 'GF-0125',
      classId: null,
      className: null,
      classLevelId: SUBJECT_IDS.jss1,
    }),
  ],
  ...overrides,
});
