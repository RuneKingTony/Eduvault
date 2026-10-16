import type {
  ClassDetail,
  ClassLevel,
  ClassSummary,
  ClassTeacher,
} from '@eduvault/api-contract';

export const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const IDS = {
  p1: uuid(1),
  jss1: uuid(2),
  ss3: uuid(3),
  lekki: uuid(10),
  ikeja: uuid(11),
  gold: uuid(20),
  silver: uuid(21),
  ayo: uuid(30),
  claire: uuid(31),
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
