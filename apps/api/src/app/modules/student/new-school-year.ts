import {
  START_DUPLICATE_ROW_MESSAGE,
  START_FINAL_YEAR_MOVE_MESSAGE,
  START_NOT_FINAL_YEAR_GRADUATE_MESSAGE,
  archivedClassMessage,
  chooseLevelClassMessage,
  type ClassChoice,
  type NewSchoolYearGroup,
  type NewSchoolYearOutcome,
  type NewSchoolYearRow,
  type StudentLife,
} from '@eduvault/api-contract';
import { yearStartingNext } from '@eduvault/shared';

export interface YearRange {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface TargetYears {
  target: YearRange;
  leaving: YearRange;
}

interface TargetInput {
  currentTerm: { sessionId: string; sequence: number };
  lastSequence: number;
  years: readonly YearRange[];
}

const byStart = (a: YearRange, b: YearRange) =>
  a.startsOn.localeCompare(b.startsOn);

export function pickTargetYears(input: TargetInput): TargetYears | null {
  const { currentTerm, lastSequence, years } = input;
  const current = years.find((year) => year.id === currentTerm.sessionId);
  if (current === undefined) {
    return null;
  }
  if (currentTerm.sequence === lastSequence) {
    const target = yearStartingNext(years, current.id);
    return target === undefined ? null : { target, leaving: current };
  }
  if (currentTerm.sequence === 1) {
    const leaving = years
      .filter((year) => year.startsOn < current.startsOn)
      .toSorted(byStart)
      .at(-1);
    return leaving === undefined ? null : { target: current, leaving };
  }
  return null;
}

export interface WaitingStudent {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  inactive: boolean;
  levelId: string;
  armId: string | null;
}

export interface LevelFact {
  id: string;
  name: string;
  sequence: number;
  nextLevelId: string | null;
}

export interface ArmFact {
  id: string;
  levelId: string;
  levelName: string;
  name: string;
  campusId: string;
  campusName: string;
  retired: boolean;
}

const displayOf = (arm: ArmFact): string => `${arm.levelName} ${arm.name}`;

const choiceOf = (arm: ArmFact): ClassChoice => ({
  id: arm.id,
  name: displayOf(arm),
  campusName: arm.campusName,
});

function choicesFor(
  arms: readonly ArmFact[],
  levelId: string,
  campusId: string | null
): ClassChoice[] {
  const sameCampus = (arm: ArmFact) => Number(arm.campusId === campusId);
  return arms
    .filter((arm) => arm.levelId === levelId && !arm.retired)
    .toSorted(
      (a, b) =>
        sameCampus(b) - sameCampus(a) ||
        a.campusName.localeCompare(b.campusName) ||
        a.name.localeCompare(b.name)
    )
    .map((arm) => choiceOf(arm));
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

interface PlanInput {
  students: readonly WaitingStudent[];
  levels: readonly LevelFact[];
  arms: readonly ArmFact[];
}

const byName = (a: WaitingStudent, b: WaitingStudent) =>
  a.lastName.localeCompare(b.lastName) ||
  a.firstName.localeCompare(b.firstName);

function sameNameTarget(
  from: ArmFact | undefined,
  nextLevel: LevelFact | undefined,
  arms: readonly ArmFact[]
): ArmFact | undefined {
  if (from === undefined || nextLevel === undefined) {
    return undefined;
  }
  return arms.find(
    (arm) =>
      arm.levelId === nextLevel.id &&
      arm.campusId === from.campusId &&
      !arm.retired &&
      sameName(arm.name, from.name)
  );
}

const fromClassOf = (
  from: ArmFact | undefined
): NewSchoolYearGroup['fromClass'] =>
  from === undefined
    ? null
    : {
        id: from.id,
        name: displayOf(from),
        campusName: from.campusName,
        archived: from.retired,
      };

function buildGroup(
  members: readonly WaitingStudent[],
  level: LevelFact,
  input: PlanInput
): NewSchoolYearGroup {
  const { levels, arms } = input;
  const from = arms.find((arm) => arm.id === members[0]?.armId);
  const nextLevel = levels.find(
    (candidate) => candidate.id === level.nextLevelId
  );
  const toArm = sameNameTarget(from, nextLevel, arms);
  const fromCampus = from?.campusId ?? null;
  return {
    fromClass: fromClassOf(from),
    level: {
      id: level.id,
      name: level.name,
      isFinalYear: level.nextLevelId === null,
    },
    nextLevel:
      nextLevel === undefined
        ? null
        : { id: nextLevel.id, name: nextLevel.name },
    toClass: toArm === undefined ? null : choiceOf(toArm),
    classChoices:
      nextLevel === undefined ? [] : choicesFor(arms, nextLevel.id, fromCampus),
    repeatClassChoices:
      from === undefined || from.retired
        ? choicesFor(arms, level.id, fromCampus)
        : [],
    students: members
      .filter((student) => !student.inactive)
      .toSorted(byName)
      .map(({ id, firstName, lastName, admissionNumber }) => ({
        id,
        firstName,
        lastName,
        admissionNumber,
      })),
    inactive: members
      .filter((student) => student.inactive)
      .toSorted(byName)
      .map((student) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
      })),
  };
}

const sortKey = (
  group: NewSchoolYearGroup,
  sequences: ReadonlyMap<string, number>
): string =>
  [
    String(sequences.get(group.level.id) ?? 0).padStart(6, '0'),
    group.fromClass === null ? '1' : '0',
    group.fromClass?.campusName ?? '',
    group.fromClass?.name ?? '',
  ].join('|');

export function planGroups(input: PlanInput): NewSchoolYearGroup[] {
  const buckets = new Map<string, WaitingStudent[]>();
  for (const student of input.students) {
    const key = `${student.armId ?? 'none'}:${student.levelId}`;
    buckets.set(key, [...(buckets.get(key) ?? []), student]);
  }
  const sequences = new Map(
    input.levels.map((level) => [level.id, level.sequence])
  );
  return [...buckets.values()]
    .flatMap((members) => {
      const level = input.levels.find(
        (candidate) => candidate.id === members[0]?.levelId
      );
      return level === undefined ? [] : [buildGroup(members, level, input)];
    })
    .toSorted((a, b) =>
      sortKey(a, sequences).localeCompare(sortKey(b, sequences))
    );
}

export interface RowLevelFacts {
  levelId: string;
  levelName: string;
  nextLevelId: string | null;
  nextLevelName: string | null;
}

export interface RowArmFacts {
  id: string;
  levelId: string;
  display: string;
  retired: boolean;
  campusId: string;
}

function classError(
  arm: RowArmFacts | undefined,
  wanted: { levelId: string; levelName: string }
): string | null {
  if (arm?.levelId !== wanted.levelId) {
    return chooseLevelClassMessage(wanted.levelName);
  }
  return arm.retired ? archivedClassMessage(arm.display) : null;
}

export function rowError(
  row: Pick<NewSchoolYearRow, 'outcome'>,
  level: RowLevelFacts,
  arm: RowArmFacts | undefined
): string | null {
  const isFinalYear = level.nextLevelId === null;
  switch (row.outcome) {
    case 'graduate': {
      return isFinalYear ? null : START_NOT_FINAL_YEAR_GRADUATE_MESSAGE;
    }
    case 'move': {
      return isFinalYear
        ? START_FINAL_YEAR_MOVE_MESSAGE
        : classError(arm, {
            levelId: level.nextLevelId ?? '',
            levelName: level.nextLevelName ?? 'next level',
          });
    }
    case 'repeat': {
      return classError(arm, level);
    }
  }
}

export function duplicateRowError(
  rows: readonly Pick<NewSchoolYearRow, 'studentId'>[]
): string | null {
  const ids = new Set(rows.map((row) => row.studentId));
  return ids.size === rows.length ? null : START_DUPLICATE_ROW_MESSAGE;
}

interface OutcomeCounts {
  moved: number;
  repeating: number;
  graduated: number;
}

export function summarize(
  outcomes: readonly NewSchoolYearOutcome[]
): OutcomeCounts {
  const count = (wanted: NewSchoolYearOutcome) =>
    outcomes.filter((outcome) => outcome === wanted).length;
  return {
    moved: count('move'),
    repeating: count('repeat'),
    graduated: count('graduate'),
  };
}

export interface StudentRowFacts {
  studentId: string;
  userId: string | null;
  name: string;
  campusId: string;
  life: StudentLife;
  inTarget: boolean;
  level: RowLevelFacts | null;
}

export interface PlannedEnrolment {
  studentId: string;
  outcome: 'move' | 'repeat';
  levelId: string;
  armId: string;
  campusId: string;
}

export interface PlannedGraduate {
  id: string;
  userId: string | null;
  name: string;
  campusId: string;
}

interface RowPlan {
  enrolments: PlannedEnrolment[];
  graduates: PlannedGraduate[];
  skipped: number;
}

type PlanResult = { ok: true; plan: RowPlan } | { ok: false; error: string };

type RowStep =
  | { kind: 'skip' }
  | { kind: 'error'; error: string }
  | { kind: 'graduate'; graduate: PlannedGraduate }
  | { kind: 'enrol'; enrolment: PlannedEnrolment };

function enrolmentOf(
  row: NewSchoolYearRow,
  facts: StudentRowFacts,
  placed: { level: RowLevelFacts; arm: RowArmFacts }
): PlannedEnrolment {
  const { level, arm } = placed;
  return {
    studentId: facts.studentId,
    outcome: row.outcome === 'move' ? 'move' : 'repeat',
    levelId: row.outcome === 'move' ? (level.nextLevelId ?? '') : level.levelId,
    armId: arm.id,
    campusId: arm.campusId,
  };
}

type WaitingFacts = StudentRowFacts & { level: RowLevelFacts };

const isWaiting = (facts: StudentRowFacts | undefined): facts is WaitingFacts =>
  facts?.life === 'active' && !facts.inTarget && facts.level !== null;

function planRow(
  row: NewSchoolYearRow,
  facts: StudentRowFacts | undefined,
  arms: ReadonlyMap<string, RowArmFacts>
): RowStep {
  if (!isWaiting(facts)) {
    return { kind: 'skip' };
  }
  const { level } = facts;
  const arm =
    row.classArmId === undefined ? undefined : arms.get(row.classArmId);
  const error = rowError(row, level, arm);
  if (error !== null) {
    return { kind: 'error', error };
  }
  if (row.outcome === 'graduate' || arm === undefined) {
    const { studentId: id, userId, name, campusId } = facts;
    return { kind: 'graduate', graduate: { id, userId, name, campusId } };
  }
  return { kind: 'enrol', enrolment: enrolmentOf(row, facts, { level, arm }) };
}

export function planRows(input: {
  rows: readonly NewSchoolYearRow[];
  students: ReadonlyMap<string, StudentRowFacts>;
  arms: ReadonlyMap<string, RowArmFacts>;
}): PlanResult {
  const plan: RowPlan = { enrolments: [], graduates: [], skipped: 0 };
  for (const row of input.rows) {
    const step = planRow(row, input.students.get(row.studentId), input.arms);
    switch (step.kind) {
      case 'error': {
        return { ok: false, error: step.error };
      }
      case 'skip': {
        plan.skipped += 1;
        break;
      }
      case 'graduate': {
        plan.graduates.push(step.graduate);
        break;
      }
      case 'enrol': {
        plan.enrolments.push(step.enrolment);
        break;
      }
    }
  }
  return { ok: true, plan };
}
