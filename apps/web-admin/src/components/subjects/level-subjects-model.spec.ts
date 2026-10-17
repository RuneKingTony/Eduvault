import type { LevelSubject, Subject } from '@eduvault/api-contract';
import {
  addCore,
  addable,
  draftOf,
  kindChangeNeedsConfirmation,
  moveDown,
  moveUp,
  needsConfirmation,
  removeRow,
  setKind,
  toBody,
  type DraftRow,
} from './level-subjects-model';

const row = (
  subjectId: string,
  overrides: Partial<DraftRow> = {}
): DraftRow => ({
  subjectId,
  name: subjectId.toUpperCase(),
  kind: 'core',
  takerCount: 0,
  ...overrides,
});

const ids = (rows: readonly DraftRow[]) => rows.map((entry) => entry.subjectId);

const subject = (id: string, retired = false): Subject => ({
  id,
  code: id.toUpperCase().slice(0, 3),
  name: id,
  retiredAt: retired ? '2026-01-01T00:00:00.000Z' : null,
  levelCodes: [],
});

describe('level subjects model', () => {
  const rows = [row('a'), row('b'), row('c')];

  it('moves a row up and down by one place', () => {
    expect(ids(moveUp(rows, 2))).toEqual(['a', 'c', 'b']);
    expect(ids(moveDown(rows, 0))).toEqual(['b', 'a', 'c']);
  });

  it('leaves the list alone at either end', () => {
    expect(ids(moveUp(rows, 0))).toEqual(['a', 'b', 'c']);
    expect(ids(moveDown(rows, 2))).toEqual(['a', 'b', 'c']);
  });

  it('does not change the list it was given', () => {
    moveUp(rows, 1);
    expect(ids(rows)).toEqual(['a', 'b', 'c']);
  });

  it('switches one row between Core and Elective', () => {
    const next = setKind(rows, 'b', 'elective');
    expect(next.map((entry) => entry.kind)).toEqual([
      'core',
      'elective',
      'core',
    ]);
  });

  it('removes a row', () => {
    expect(ids(removeRow(rows, 'b'))).toEqual(['a', 'c']);
  });

  it('adds a subject last as Core with no takers', () => {
    expect(addCore(rows, { id: 'd', name: 'D' }).at(-1)).toEqual({
      subjectId: 'd',
      name: 'D',
      kind: 'core',
      takerCount: 0,
    });
  });

  it('builds the request body from position and kind only', () => {
    expect(
      toBody([row('a'), row('b', { kind: 'elective', takerCount: 4 })])
    ).toEqual({
      subjects: [
        { subjectId: 'a', kind: 'core' },
        { subjectId: 'b', kind: 'elective' },
      ],
    });
  });

  it('asks before removing only an elective that has takers', () => {
    expect(
      needsConfirmation(row('a', { kind: 'elective', takerCount: 3 }))
    ).toBe(true);
    expect(needsConfirmation(row('a', { kind: 'elective' }))).toBe(false);
    expect(needsConfirmation(row('a', { kind: 'core', takerCount: 3 }))).toBe(
      false
    );
  });

  it('asks before making an elective with takers core, not the other way', () => {
    const taken = row('a', { kind: 'elective', takerCount: 3 });
    expect(kindChangeNeedsConfirmation(taken, 'core')).toBe(true);
    expect(kindChangeNeedsConfirmation(taken, 'elective')).toBe(false);
    expect(
      kindChangeNeedsConfirmation(row('a', { kind: 'elective' }), 'core')
    ).toBe(false);
    expect(
      kindChangeNeedsConfirmation(row('a', { takerCount: 3 }), 'elective')
    ).toBe(false);
  });

  it('lists the active subjects that are not already on the level', () => {
    const active = [subject('a'), subject('x'), subject('old', true)];
    expect(addable(active, rows).map((entry) => entry.id)).toEqual(['x']);
  });

  it('stops offering subjects at 30 rows', () => {
    const full = Array.from({ length: 30 }, (_, index) => row(`s${index}`));
    expect(addable([subject('x')], full)).toEqual([]);
  });

  it('orders a saved list by sequence', () => {
    const saved: LevelSubject[] = [
      {
        classLevelId: 'l',
        subjectId: 'b',
        subjectCode: 'B',
        subjectName: 'B',
        kind: 'elective',
        sequence: 2,
        takerCount: 5,
      },
      {
        classLevelId: 'l',
        subjectId: 'a',
        subjectCode: 'A',
        subjectName: 'A',
        kind: 'core',
        sequence: 1,
        takerCount: 0,
      },
    ];
    expect(draftOf(saved)).toEqual([
      row('a', { name: 'A' }),
      row('b', { name: 'B', kind: 'elective', takerCount: 5 }),
    ]);
  });
});
