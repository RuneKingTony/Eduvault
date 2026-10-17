import {
  LEVEL_SUBJECTS_MAX,
  type LevelSubject,
  type LevelSubjectKind,
  type ReplaceLevelSubjectsInput,
  type Subject,
} from '@eduvault/api-contract';

export interface DraftRow {
  subjectId: string;
  name: string;
  kind: LevelSubjectKind;
  takerCount: number;
}

export const draftOf = (rows: readonly LevelSubject[]): DraftRow[] =>
  rows
    .toSorted((a, b) => a.sequence - b.sequence)
    .map((row) => ({
      subjectId: row.subjectId,
      name: row.subjectName,
      kind: row.kind,
      takerCount: row.takerCount,
    }));

function swap(rows: readonly DraftRow[], from: number, to: number): DraftRow[] {
  const first = rows[from];
  const second = rows[to];
  if (first === undefined || second === undefined) {
    return [...rows];
  }
  return rows.map((row, index) => {
    if (index === from) {
      return second;
    }
    return index === to ? first : row;
  });
}

export const moveUp = (rows: readonly DraftRow[], index: number): DraftRow[] =>
  swap(rows, index, index - 1);

export const moveDown = (
  rows: readonly DraftRow[],
  index: number
): DraftRow[] => swap(rows, index, index + 1);

export const setKind = (
  rows: readonly DraftRow[],
  subjectId: string,
  kind: LevelSubjectKind
): DraftRow[] =>
  rows.map((row) => (row.subjectId === subjectId ? { ...row, kind } : row));

export const removeRow = (
  rows: readonly DraftRow[],
  subjectId: string
): DraftRow[] => rows.filter((row) => row.subjectId !== subjectId);

export const addCore = (
  rows: readonly DraftRow[],
  subject: Pick<Subject, 'id' | 'name'>
): DraftRow[] => [
  ...rows,
  { subjectId: subject.id, name: subject.name, kind: 'core', takerCount: 0 },
];

export const toBody = (
  rows: readonly DraftRow[]
): ReplaceLevelSubjectsInput => ({
  subjects: rows.map(({ subjectId, kind }) => ({ subjectId, kind })),
});

export const needsConfirmation = (row: DraftRow): boolean =>
  row.kind === 'elective' && row.takerCount > 0;

export const kindChangeNeedsConfirmation = (
  row: DraftRow,
  kind: LevelSubjectKind
): boolean => kind === 'core' && needsConfirmation(row);

export const addable = (
  active: readonly Subject[],
  rows: readonly DraftRow[]
): Subject[] =>
  rows.length >= LEVEL_SUBJECTS_MAX
    ? []
    : active.filter(
        (subject) =>
          subject.retiredAt === null &&
          !rows.some((row) => row.subjectId === subject.id)
      );
