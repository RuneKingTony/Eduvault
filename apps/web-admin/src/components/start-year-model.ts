import {
  chooseClassForGroupMessage,
  type NewSchoolYearGroup,
  type NewSchoolYearOutcome,
  type NewSchoolYearPreview,
  type NewSchoolYearRow,
} from '@eduvault/api-contract';

export interface StartSelection {
  repeating: ReadonlySet<string>;
  targets: Readonly<Record<string, string>>;
  repeatTargets: Readonly<Record<string, string>>;
}

export const EMPTY_SELECTION: StartSelection = {
  repeating: new Set(),
  targets: {},
  repeatTargets: {},
};

export const groupKeyOf = (group: NewSchoolYearGroup): string =>
  `${group.fromClass?.id ?? 'none'}:${group.level.id}`;

export const groupLabel = (group: NewSchoolYearGroup): string =>
  group.fromClass === null
    ? `${group.level.name} · no class`
    : `${group.fromClass.name} (${group.fromClass.campusName})`;

export const isLocked = (
  group: NewSchoolYearGroup,
  canGraduate: boolean
): boolean => group.level.isFinalYear && !canGraduate;

export const moveTarget = (
  group: NewSchoolYearGroup,
  selection: StartSelection
): string | null =>
  selection.targets[groupKeyOf(group)] ?? group.toClass?.id ?? null;

export const repeatTarget = (
  group: NewSchoolYearGroup,
  selection: StartSelection
): string | null =>
  group.fromClass !== null && !group.fromClass.archived
    ? group.fromClass.id
    : (selection.repeatTargets[groupKeyOf(group)] ?? null);

export const outcomeOf = (
  group: NewSchoolYearGroup,
  studentId: string,
  selection: StartSelection
): NewSchoolYearOutcome => {
  if (selection.repeating.has(studentId)) {
    return 'repeat';
  }
  return group.level.isFinalYear ? 'graduate' : 'move';
};

const activeGroups = (preview: NewSchoolYearPreview): NewSchoolYearGroup[] =>
  preview.groups.filter((group) => !isLocked(group, preview.canGraduate));

const count = (
  group: NewSchoolYearGroup,
  selection: StartSelection,
  outcome: NewSchoolYearOutcome
): number =>
  group.students.filter(
    (student) => outcomeOf(group, student.id, selection) === outcome
  ).length;

interface StartSummary {
  moveUp: number;
  repeat: number;
  graduate: number;
}

export function summarize(
  preview: NewSchoolYearPreview,
  selection: StartSelection
): StartSummary {
  const groups = activeGroups(preview);
  const total = (outcome: NewSchoolYearOutcome) =>
    groups.reduce((sum, group) => sum + count(group, selection, outcome), 0);
  return {
    moveUp: total('move'),
    repeat: total('repeat'),
    graduate: total('graduate'),
  };
}

export const summaryText = (summary: StartSummary): string =>
  `${summary.moveUp} move up · ${summary.repeat} repeat · ${summary.graduate} graduate`;

const moveError = (group: NewSchoolYearGroup): string =>
  group.fromClass === null
    ? `Choose a class for ${groupLabel(group)}.`
    : chooseClassForGroupMessage(
        group.fromClass.name,
        group.fromClass.campusName
      );

export function groupErrors(
  group: NewSchoolYearGroup,
  selection: StartSelection
): { move: string | null; repeat: string | null } {
  const needsMove =
    count(group, selection, 'move') > 0 &&
    moveTarget(group, selection) === null;
  const needsRepeat =
    count(group, selection, 'repeat') > 0 &&
    repeatTarget(group, selection) === null;
  return {
    move: needsMove ? moveError(group) : null,
    repeat: needsRepeat
      ? `Choose a class for those repeating in ${groupLabel(group)}.`
      : null,
  };
}

export function canStart(
  preview: NewSchoolYearPreview,
  selection: StartSelection
): boolean {
  const summary = summarize(preview, selection);
  const rows = summary.moveUp + summary.repeat + summary.graduate;
  return (
    rows > 0 &&
    activeGroups(preview).every((group) => {
      const errors = groupErrors(group, selection);
      return errors.move === null && errors.repeat === null;
    })
  );
}

export function startRows(
  preview: NewSchoolYearPreview,
  selection: StartSelection
): NewSchoolYearRow[] {
  return activeGroups(preview).flatMap((group) =>
    group.students.map((student): NewSchoolYearRow => {
      const outcome = outcomeOf(group, student.id, selection);
      if (outcome === 'graduate') {
        return { studentId: student.id, outcome };
      }
      const classArmId =
        outcome === 'move'
          ? moveTarget(group, selection)
          : repeatTarget(group, selection);
      return {
        studentId: student.id,
        outcome,
        ...(classArmId === null ? {} : { classArmId }),
      };
    })
  );
}

export function startedToast(
  preview: NewSchoolYearPreview,
  result: { moved: number; repeating: number; graduated: number }
): string {
  const base = `${preview.targetYear.name} started: ${result.moved} moved up, ${result.repeating} repeating, ${result.graduated} graduated.`;
  return preview.targetYear.firstTerm.isCurrent
    ? base
    : `${base} Their new classes show once ${preview.targetYear.firstTerm.name} is made current.`;
}
