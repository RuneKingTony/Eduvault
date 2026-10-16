import type { SubjectTeacherArm } from '@eduvault/api-contract';
import {
  armCountLabel,
  copiedMessage,
  defaultTeacher,
  taughtAt,
  teachesIn,
  validateSubject,
} from './subject-model';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const row = (n: number, teacher: string | null) => ({
  subjectId: id(n),
  code: `S${n}`,
  name: `Subject ${n}`,
  kind: 'core' as const,
  teacher: teacher === null ? null : { userId: teacher, name: teacher },
});

const arm = (...teachers: (string | null)[]): SubjectTeacherArm => ({
  classId: id(1),
  displayName: 'JSS 2 Gold',
  campus: { id: id(2), name: 'Lekki' },
  subjects: teachers.map((teacher, index) => row(index + 1, teacher)),
});

describe('validateSubject', () => {
  it('trims and upper-cases the code and trims the name', () => {
    expect(validateSubject(' geo ', ' Geography ')).toEqual({
      code: 'GEO',
      name: 'Geography',
    });
  });

  it('asks for a code and a name when either is blank', () => {
    expect(validateSubject('', 'Geography')).toEqual({
      error: 'Enter a code and a name.',
    });
    expect(validateSubject('GEO', '  ')).toEqual({
      error: 'Enter a code and a name.',
    });
  });

  it('refuses digits and more than five letters', () => {
    expect(validateSubject('AB1', 'Art')).toEqual({
      error: 'Use up to 5 letters for the code.',
    });
    expect(validateSubject('ABCDEF', 'Art')).toEqual({
      error: 'Use up to 5 letters for the code.',
    });
  });
});

describe('taughtAt', () => {
  it('shows up to four level codes and lists the rest', () => {
    expect(taughtAt(['P4', 'JSS1']).more).toEqual([]);
    expect(taughtAt(['A', 'B', 'C', 'D', 'E', 'F'])).toEqual({
      shown: ['A', 'B', 'C', 'D'],
      more: ['E', 'F'],
    });
    expect(taughtAt([])).toEqual({ shown: [], more: [] });
  });
});

describe('armCountLabel', () => {
  it('counts unassigned subjects, else all subjects', () => {
    expect(armCountLabel(arm('a', null, null))).toBe('2 unassigned');
    expect(armCountLabel(arm('a', 'b'))).toBe('2 subjects');
    expect(armCountLabel(arm('a'))).toBe('1 subject');
  });
});

describe('defaultTeacher', () => {
  const candidates = [
    { userId: 'ayo', name: 'Ayo' },
    { userId: 'emeka', name: 'Emeka' },
  ];

  it('keeps the current teacher, else the first candidate, else nothing', () => {
    expect(defaultTeacher('emeka', candidates)).toBe('emeka');
    expect(defaultTeacher(undefined, candidates)).toBe('ayo');
    expect(defaultTeacher('gone', candidates)).toBe('ayo');
    expect(defaultTeacher('emeka', [])).toBe('');
  });
});

describe('teachesIn and copiedMessage', () => {
  it('finds the viewer among an arm’s teachers', () => {
    expect(teachesIn(arm('a', 'me'), 'me')).toBe(true);
    expect(teachesIn(arm('a', null), 'me')).toBe(false);
    expect(teachesIn(arm('a'), undefined)).toBe(false);
  });

  it('adds the skipped count only when some were skipped', () => {
    expect(copiedMessage(8, 1, 'First term')).toBe(
      '8 subject teachers copied from First term. 1 skipped.'
    );
    expect(copiedMessage(1, 0, 'First term')).toBe(
      '1 subject teacher copied from First term.'
    );
  });
});
