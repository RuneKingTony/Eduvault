import type { ClassRecord, LevelRecord } from './class.repository';
import {
  classDisplayName,
  orderTeachers,
  reorderLevelIds,
  toClassDetail,
  toClassLevel,
  toClassSummary,
} from './class-view';

const record = (overrides: Partial<ClassRecord> = {}): ClassRecord => ({
  id: 'class-1',
  name: 'Gold',
  levelId: 'level-1',
  levelCode: 'JSS2',
  levelName: 'JSS 2',
  levelNextLevelId: 'level-2',
  campusId: 'campus-1',
  campusName: 'Lekki',
  retiredAt: null,
  ...overrides,
});

describe('classDisplayName', () => {
  it('joins the level name and the class name', () => {
    expect(classDisplayName('JSS 2', 'Gold')).toBe('JSS 2 Gold');
  });
});

const level = (nextLevelId: string | null): LevelRecord => ({
  id: 'a',
  code: 'SS3',
  name: 'SS 3',
  sequence: 12,
  nextLevelId,
});

describe('toClassLevel', () => {
  it('marks a level with no next level as the final year', () => {
    expect(toClassLevel(level(null)).isFinalYear).toBe(true);
    expect(toClassLevel(level('b')).isFinalYear).toBe(false);
  });
});

describe('orderTeachers', () => {
  it('orders lead, assistant, uniform and then by name', () => {
    const ordered = orderTeachers([
      { userId: 'u4', name: 'Zed', role: 'uniform' },
      { userId: 'u3', name: 'Claire Ade', role: 'assistant' },
      { userId: 'u2', name: 'Bola', role: 'assistant' },
      { userId: 'u1', name: 'Ayo Bassey', role: 'lead' },
    ]);
    expect(ordered.map((teacher) => teacher.name)).toEqual([
      'Ayo Bassey',
      'Bola',
      'Claire Ade',
      'Zed',
    ]);
  });
});

describe('toClassSummary', () => {
  it('shows the display name, an ordered staff list and no students yet', () => {
    const rows = [
      { userId: 'u2', name: 'Claire Ade', role: 'assistant', classId: 'c' },
      { userId: 'u1', name: 'Ayo Bassey', role: 'lead', classId: 'c' },
    ] as const;
    const summary = toClassSummary(record(), rows);
    expect(summary).toEqual({
      id: 'class-1',
      name: 'Gold',
      displayName: 'JSS 2 Gold',
      level: { id: 'level-1', code: 'JSS2', name: 'JSS 2' },
      campus: { id: 'campus-1', name: 'Lekki' },
      classTeachers: [
        { userId: 'u1', name: 'Ayo Bassey', role: 'lead' },
        { userId: 'u2', name: 'Claire Ade', role: 'assistant' },
      ],
      studentCount: 0,
      retiredAt: null,
    });
  });
});

describe('toClassDetail', () => {
  it('adds the final-year flag and passes the roster through', () => {
    expect(toClassDetail(record(), [], [])).toMatchObject({
      isFinalYear: false,
      roster: [],
    });
    expect(
      toClassDetail(record({ levelNextLevelId: null }), [], null)
    ).toMatchObject({ isFinalYear: true, roster: null });
  });
});

describe('reorderLevelIds', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves a level up to the given position', () => {
    expect(reorderLevelIds(ids, 'c', 1)).toEqual(['c', 'a', 'b', 'd']);
    expect(reorderLevelIds(ids, 'd', 2)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves a level down', () => {
    expect(reorderLevelIds(ids, 'a', 3)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('clamps the position to the ladder', () => {
    expect(reorderLevelIds(ids, 'b', 99)).toEqual(['a', 'c', 'd', 'b']);
    expect(reorderLevelIds(ids, 'b', 0)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('keeps the order when the level stays where it is', () => {
    expect(reorderLevelIds(ids, 'b', 2)).toEqual(ids);
  });
});
