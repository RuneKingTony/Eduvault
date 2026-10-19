import type {
  ClassDetail,
  ClassLevel,
  ClassSummary,
  ClassTeacher,
} from '@eduvault/api-contract';
import { testId } from './test-api';

export const IDS = {
  p1: testId(0xb0_01),
  jss1: testId(0xb0_02),
  ss3: testId(0xb0_03),
  lekki: testId(0xb0_0a),
  ikeja: testId(0xb0_0b),
  gold: testId(0xb0_14),
  silver: testId(0xb0_15),
  ayo: testId(0xb0_1e),
  claire: testId(0xb0_1f),
} as const;

export const classLevel = (
  overrides: Partial<ClassLevel> = {}
): ClassLevel => ({
  id: IDS.p1,
  code: 'P1',
  name: 'Primary 1',
  sequence: 1,
  nextLevelId: null,
  isFinalYear: true,
  ...overrides,
});

export const ladder = (): ClassLevel[] => [
  classLevel({
    id: IDS.p1,
    code: 'P1',
    name: 'Primary 1',
    sequence: 1,
    nextLevelId: IDS.jss1,
    isFinalYear: false,
  }),
  classLevel({
    id: IDS.jss1,
    code: 'JSS1',
    name: 'JSS 1',
    sequence: 2,
    nextLevelId: IDS.ss3,
    isFinalYear: false,
  }),
  classLevel({
    id: IDS.ss3,
    code: 'SS3',
    name: 'SS 3',
    sequence: 3,
  }),
];

export const teacher = (
  name: string,
  role: ClassTeacher['role'] = 'lead'
): ClassTeacher => ({
  userId: name.startsWith('Ayo') ? IDS.ayo : IDS.claire,
  name,
  role,
});

export const classSummary = (
  overrides: Partial<ClassSummary> = {}
): ClassSummary => ({
  id: IDS.gold,
  name: 'Gold',
  displayName: 'JSS 1 Gold',
  level: { id: IDS.jss1, code: 'JSS1', name: 'JSS 1' },
  campus: { id: IDS.lekki, name: 'Lekki' },
  classTeachers: [],
  studentCount: 0,
  retiredAt: null,
  ...overrides,
});

export const classDetail = (
  overrides: Partial<ClassDetail> = {}
): ClassDetail => ({
  ...classSummary(),
  isFinalYear: false,
  roster: [],
  ...overrides,
});
