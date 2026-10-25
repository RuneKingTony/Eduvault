import { shiftDate } from '../date-shift';
import { DEMO_CAMPUSES, DEMO_LEVEL_COUNT, type DemoCampus } from './config';
import {
  DEMO_SUBJECTS,
  FEMALE_NAMES,
  ARM_NAME_BY_CAMPUS,
  levelSubjects,
  MALE_NAMES,
  STREETS,
  SURNAMES,
  TEACHER_SUBJECT_ROTATION,
} from './lists';
import type { Random } from './prng';

export const EMAIL_DOMAIN = 'riverside.test';

export const DEMO_SCHOOL = {
  slug: 'riverside',
  name: 'Riverside International School',
  admissionPrefix: 'RV',
  city: 'Lagos',
} as const;

export const DEMO_OWNER = {
  name: 'Folake Adeniyi',
  email: `owner@${EMAIL_DOMAIN}`,
} as const;

const MAX_CLASSES_PER_TEACHER_SUBJECT = 3;
const TWO_GUARDIAN_SHARE = 0.7;
const AGE_AT_PRIMARY_ONE = 5;
const DAYS_IN_YEAR = 365;

export interface DemoLevel {
  code: string;
  name: string;
  sequence: number;
}

export const DEMO_LEVELS: readonly DemoLevel[] = [
  ...Array.from({ length: 6 }, (_, index) => ({
    code: `P${index + 1}`,
    name: `Primary ${index + 1}`,
    sequence: index + 1,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    code: `JSS${index + 1}`,
    name: `JSS ${index + 1}`,
    sequence: index + 7,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    code: `SS${index + 1}`,
    name: `SS ${index + 1}`,
    sequence: index + 10,
  })),
];

export type StudentNumber = number & { readonly brand: 'student' };
export type FamilyNumber = number & { readonly brand: 'family' };
export type ArmIndex = number & { readonly brand: 'arm' };

const studentNumber = (value: number): StudentNumber => value as StudentNumber;
const familyNumber = (value: number): FamilyNumber => value as FamilyNumber;
const armIndex = (value: number): ArmIndex => value as ArmIndex;

export interface DemoArm {
  index: ArmIndex;
  level: DemoLevel;
  campus: DemoCampus;
  name: string;
}

/** Level by level, Main then Annex, so a campus's arms are every other index. */
export function buildArms(): DemoArm[] {
  return DEMO_LEVELS.flatMap((level, levelIndex) =>
    DEMO_CAMPUSES.map((campus, campusIndex) => ({
      index: armIndex(levelIndex * DEMO_CAMPUSES.length + campusIndex),
      level,
      campus,
      name: ARM_NAME_BY_CAMPUS[campus],
    }))
  );
}

export interface DemoStaff {
  key: string;
  name: string;
  email: string;
  roles: string[];
  campuses: DemoCampus[];
  title: string;
}

export interface DemoTeacher extends DemoStaff {
  index: number;
  leadsArm: ArmIndex | null;
  subjects: string[];
}

export interface SubjectAssignment {
  teacher: number;
  arm: ArmIndex;
  subject: string;
}

const subjectName = (code: string): string =>
  DEMO_SUBJECTS.find((subject) => subject.code === code)?.name ?? code;

export function buildLeaders(): DemoStaff[] {
  return [
    {
      key: 'principal',
      name: 'Ibrahim Danjuma',
      email: `principal@${EMAIL_DOMAIN}`,
      roles: ['principal'],
      campuses: [...DEMO_CAMPUSES],
      title: 'Principal',
    },
    {
      key: 'bursar-main',
      name: 'Chiamaka Nwosu',
      email: `bursar.main@${EMAIL_DOMAIN}`,
      roles: ['bursar'],
      campuses: ['Main'],
      title: 'Bursar, Main',
    },
    {
      key: 'bursar-annex',
      name: 'Kayode Salami',
      email: `bursar.annex@${EMAIL_DOMAIN}`,
      roles: ['bursar'],
      campuses: ['Annex'],
      title: 'Bursar, Annex',
    },
  ];
}

const teacherEmail = (index: number): string =>
  `teacher${String(index + 1).padStart(2, '0')}@${EMAIL_DOMAIN}`;

function teacherSubjects(index: number): string[] {
  const first =
    TEACHER_SUBJECT_ROTATION[index % TEACHER_SUBJECT_ROTATION.length];
  const second =
    TEACHER_SUBJECT_ROTATION[(index + 5) % TEACHER_SUBJECT_ROTATION.length];
  const teachesTwo = index % 5 < 2;
  return [first, ...(teachesTwo ? [second] : [])].filter(
    (code): code is string => code !== undefined
  );
}

export function buildTeachers(count: number, random: Random): DemoTeacher[] {
  const females = random.shuffle(FEMALE_NAMES);
  const males = random.shuffle(MALE_NAMES);
  const surnames = random.shuffle(SURNAMES);
  const arms = buildArms();
  return Array.from({ length: count }, (_, index) => {
    const pool = index % 2 === 0 ? females : males;
    const given = pool[Math.floor(index / 2) % pool.length] ?? 'Teacher';
    const surname =
      surnames[
        (index * 7 + Math.floor(index / SURNAMES.length)) % SURNAMES.length
      ] ?? 'Staff';
    const subjects = teacherSubjects(index);
    const lead = arms[index];
    return {
      index,
      key: `teacher-${index + 1}`,
      name: `${given} ${surname}`,
      email: teacherEmail(index),
      roles: ['teacher'],
      campuses: [DEMO_CAMPUSES[index % DEMO_CAMPUSES.length] ?? 'Main'],
      title: `${subjectName(subjects[0] ?? '')} teacher`,
      leadsArm: lead?.index ?? null,
      subjects,
    };
  });
}

interface SubjectSlot {
  campus: DemoCampus;
  subject: string;
  teachers: DemoTeacher[];
}

function subjectSlots(teachers: readonly DemoTeacher[]): SubjectSlot[] {
  const slots = new Map<string, SubjectSlot>();
  for (const teacher of teachers) {
    for (const campus of teacher.campuses) {
      for (const subject of teacher.subjects) {
        const key = `${campus}:${subject}`;
        const slot = slots.get(key) ?? { campus, subject, teachers: [] };
        slot.teachers.push(teacher);
        slots.set(key, slot);
      }
    }
  }
  return [...slots.values()];
}

export function planSubjectTeachers(
  teachers: readonly DemoTeacher[],
  arms: readonly DemoArm[]
): SubjectAssignment[] {
  return subjectSlots(teachers).flatMap(
    ({ campus, subject, teachers: team }) => {
      const classes = arms.filter(
        (arm) =>
          arm.campus === campus &&
          levelSubjects(arm.level.code).some(
            (entry) => entry.subject === subject
          )
      );
      return team.flatMap((teacher, position) =>
        classes
          .filter((_, offset) => offset % team.length === position)
          .slice(0, MAX_CLASSES_PER_TEACHER_SUBJECT)
          .map((arm) => ({ teacher: teacher.index, arm: arm.index, subject }))
      );
    }
  );
}

export interface DemoGuardian {
  fullName: string;
  phone: string;
  address: string;
  relationship: 'mother' | 'father' | 'guardian';
  paysFees: boolean;
  /** Set for the wallet sample, who sign in with an email; everyone else gets a username. */
  email: string | null;
}

export interface DemoChild {
  number: StudentNumber;
  firstName: string;
  lastName: string;
  gender: 'F' | 'M';
  dateOfBirth: string;
  arm: ArmIndex;
  level: DemoLevel;
}

export interface DemoFamily {
  number: FamilyNumber;
  surname: string;
  campus: DemoCampus;
  guardians: DemoGuardian[];
  children: DemoChild[];
}

export function familyOf(
  families: readonly DemoFamily[],
  number: FamilyNumber
): DemoFamily {
  const family = families.find((row) => row.number === number);
  if (family === undefined) {
    throw new Error(`The demo plan has no family ${number}.`);
  }
  return family;
}

export function payerEmailOf(family: DemoFamily): string {
  const { email } = payerOf(family);
  if (email === null) {
    throw new Error(
      `The paying guardian of family ${family.number} has no email.`
    );
  }
  return email;
}

export function payerOf(family: DemoFamily): DemoGuardian {
  const payer = family.guardians.find((guardian) => guardian.paysFees);
  if (payer === undefined) {
    throw new Error(`Family ${family.number} has no paying guardian.`);
  }
  return payer;
}

const MOBILE_PREFIXES = ['803', '805', '802', '806', '809', '813', '816'];

function phoneNumber(random: Random): string {
  const middle = String(random.int(1000)).padStart(3, '0');
  const last = String(random.int(10_000)).padStart(4, '0');
  return `0${random.pick(MOBILE_PREFIXES)} ${middle} ${last}`;
}

function familySize(random: Random): number {
  const roll = random.int(100);
  if (roll < 70) {
    return 1;
  }
  return roll < 95 ? 2 : 3;
}

function buildGuardians(surname: string, random: Random): DemoGuardian[] {
  const address = `${random.between(1, 60)} ${random.pick(STREETS)}`;
  const guardian = (
    given: string,
    relationship: DemoGuardian['relationship'],
    paysFees: boolean
  ): DemoGuardian => ({
    fullName: `${given} ${surname}`,
    phone: phoneNumber(random),
    address,
    relationship,
    paysFees,
    email: null,
  });
  if (random.chance(TWO_GUARDIAN_SHARE)) {
    const motherPays = random.chance(0.5);
    return [
      guardian(random.pick(FEMALE_NAMES), 'mother', motherPays),
      guardian(random.pick(MALE_NAMES), 'father', !motherPays),
    ];
  }
  const lone = random.pick(['mother', 'mother', 'father', 'guardian'] as const);
  const names = lone === 'father' ? MALE_NAMES : FEMALE_NAMES;
  return [guardian(random.pick(names), lone, true)];
}

function leastFilledArm(
  candidates: readonly DemoArm[],
  counts: readonly number[],
  random: Random
): DemoArm {
  const lowest = Math.min(...candidates.map((arm) => counts[arm.index] ?? 0));
  return random.pick(
    candidates.filter((arm) => (counts[arm.index] ?? 0) === lowest)
  );
}

interface FamilyBuild {
  arms: readonly DemoArm[];
  counts: number[];
  today: string;
  random: Random;
}

function buildChildren(
  family: { surname: string; campus: DemoCampus; size: number; first: number },
  build: FamilyBuild
): DemoChild[] {
  const { arms, counts, today, random } = build;
  const usedLevels = new Set<string>();
  const usedNames = new Set<string>();
  return Array.from({ length: family.size }, (_, offset) => {
    const open = arms.filter(
      (arm) => arm.campus === family.campus && !usedLevels.has(arm.level.code)
    );
    const arm = leastFilledArm(open, counts, random);
    counts[arm.index] = (counts[arm.index] ?? 0) + 1;
    usedLevels.add(arm.level.code);
    const gender = random.chance(0.5) ? 'F' : 'M';
    let firstName = random.pick(gender === 'F' ? FEMALE_NAMES : MALE_NAMES);
    while (usedNames.has(firstName)) {
      firstName = random.pick(gender === 'F' ? FEMALE_NAMES : MALE_NAMES);
    }
    usedNames.add(firstName);
    const ageDays =
      (AGE_AT_PRIMARY_ONE + arm.level.sequence) * DAYS_IN_YEAR +
      random.int(DAYS_IN_YEAR);
    return {
      number: studentNumber(family.first + offset),
      firstName,
      lastName: family.surname,
      gender,
      dateOfBirth: shiftDate(today, -ageDays),
      arm: arm.index,
      level: arm.level,
    };
  });
}

export function buildFamilies(
  students: number,
  options: { today: string; random: Random }
): DemoFamily[] {
  const arms = buildArms();
  const counts = arms.map(() => 0);
  const totals: Record<DemoCampus, number> = { Main: 0, Annex: 0 };
  const families: DemoFamily[] = [];
  let admitted = 0;
  while (admitted < students) {
    const campus: DemoCampus = totals.Main <= totals.Annex ? 'Main' : 'Annex';
    const size = Math.min(
      familySize(options.random),
      students - admitted,
      DEMO_LEVEL_COUNT
    );
    const surname = options.random.pick(SURNAMES);
    const children = buildChildren(
      { surname, campus, size, first: admitted + 1 },
      { arms, counts, ...options }
    );
    families.push({
      number: familyNumber(families.length + 1),
      surname,
      campus,
      guardians: buildGuardians(surname, options.random),
      children,
    });
    totals[campus] += size;
    admitted += size;
  }
  return families;
}
