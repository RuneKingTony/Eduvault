import type {
  Subject,
  SubjectTeacherArm,
  SubjectTeachers,
} from '@eduvault/api-contract';
import { uuid } from './test-classes';

export const SUBJECT_IDS = {
  maths: uuid(100),
  english: uuid(101),
  agr: uuid(102),
  gold: uuid(110),
  silver: uuid(111),
  lekki: uuid(10),
  emeka: uuid(120),
  ayo: uuid(121),
  term: uuid(130),
  previous: uuid(131),
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
