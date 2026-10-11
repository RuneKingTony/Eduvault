import {
  duplicateRowError,
  pickTargetYears,
  planGroups,
  planRows,
  rowError,
  summarize,
  type ArmFact,
  type LevelFact,
  type RowArmFacts,
  type RowLevelFacts,
  type StudentRowFacts,
  type WaitingStudent,
  type YearRange,
} from './new-school-year';

const y2627: YearRange = {
  id: 'y26',
  name: '2026/2027',
  startsOn: '2026-09-07',
  endsOn: '2027-07-23',
};
const y2728: YearRange = {
  id: 'y27',
  name: '2027/2028',
  startsOn: '2027-09-06',
  endsOn: '2028-07-21',
};
const y2526: YearRange = {
  id: 'y25',
  name: '2025/2026',
  startsOn: '2025-09-08',
  endsOn: '2026-07-24',
};

describe('pickTargetYears', () => {
  it('targets the year that starts next while the last term is current', () => {
    expect(
      pickTargetYears({
        currentTerm: { sessionId: 'y26', sequence: 3 },
        lastSequence: 3,
        years: [y2526, y2627, y2728],
      })
    ).toEqual({ target: y2728, leaving: y2627 });
  });

  it('offers nothing in the last term when the next year does not exist', () => {
    expect(
      pickTargetYears({
        currentTerm: { sessionId: 'y26', sequence: 3 },
        lastSequence: 3,
        years: [y2526, y2627],
      })
    ).toBeNull();
  });

  it('targets the current year in its first term, leaving the year before', () => {
    expect(
      pickTargetYears({
        currentTerm: { sessionId: 'y27', sequence: 1 },
        lastSequence: 3,
        years: [y2627, y2728],
      })
    ).toEqual({ target: y2728, leaving: y2627 });
  });

  it('offers nothing in the first term of the first year', () => {
    expect(
      pickTargetYears({
        currentTerm: { sessionId: 'y26', sequence: 1 },
        lastSequence: 3,
        years: [y2627, y2728],
      })
    ).toBeNull();
  });

  it('offers nothing in the middle term', () => {
    expect(
      pickTargetYears({
        currentTerm: { sessionId: 'y26', sequence: 2 },
        lastSequence: 3,
        years: [y2627, y2728],
      })
    ).toBeNull();
  });

  it('offers nothing when the current year is unknown', () => {
    expect(
      pickTargetYears({
        currentTerm: { sessionId: 'gone', sequence: 3 },
        lastSequence: 3,
        years: [y2627, y2728],
      })
    ).toBeNull();
  });
});

const levels: LevelFact[] = [
  { id: 'j2', name: 'JSS 2', sequence: 2, nextLevelId: 'j3' },
  { id: 'j3', name: 'JSS 3', sequence: 3, nextLevelId: 'ss3' },
  { id: 'ss3', name: 'SS 3', sequence: 4, nextLevelId: null },
];

const arm = (spec: {
  id: string;
  levelId: string;
  name: string;
  campusId: string;
  retired?: boolean;
}): ArmFact => ({
  id: spec.id,
  levelId: spec.levelId,
  levelName: levels.find((level) => level.id === spec.levelId)?.name ?? '',
  name: spec.name,
  campusId: spec.campusId,
  campusName: spec.campusId === 'lekki' ? 'Lekki' : 'Ikeja',
  retired: spec.retired ?? false,
});

const arms: ArmFact[] = [
  arm({ id: 'j2-gold-l', levelId: 'j2', name: 'Gold', campusId: 'lekki' }),
  arm({
    id: 'j2-diamond-i',
    levelId: 'j2',
    name: 'Diamond',
    campusId: 'ikeja',
  }),
  arm({ id: 'j3-gold-l', levelId: 'j3', name: 'Gold', campusId: 'lekki' }),
  arm({ id: 'j3-gold-i', levelId: 'j3', name: 'Gold', campusId: 'ikeja' }),
  arm({ id: 'j3-silver-l', levelId: 'j3', name: 'Silver', campusId: 'lekki' }),
  arm({
    id: 'j3-old-l',
    levelId: 'j3',
    name: 'Old',
    campusId: 'lekki',
    retired: true,
  }),
  arm({ id: 'ss3-blue-i', levelId: 'ss3', name: 'Blue', campusId: 'ikeja' }),
];

const student = (
  id: string,
  lastName: string,
  overrides: Partial<WaitingStudent> = {}
): WaitingStudent => ({
  id,
  firstName: 'Ada',
  lastName,
  admissionNumber: `GF-${id}`,
  inactive: false,
  levelId: 'j2',
  armId: 'j2-gold-l',
  ...overrides,
});

describe('planGroups', () => {
  it('names the same-name class on the same campus one level up', () => {
    const [group] = planGroups({
      students: [student('1', 'Okeke')],
      levels,
      arms,
    });
    expect(group?.fromClass).toEqual({
      id: 'j2-gold-l',
      name: 'JSS 2 Gold',
      campusName: 'Lekki',
      archived: false,
    });
    expect(group?.toClass).toEqual({
      id: 'j3-gold-l',
      name: 'JSS 3 Gold',
      campusName: 'Lekki',
    });
    expect(group?.nextLevel).toEqual({ id: 'j3', name: 'JSS 3' });
    expect(group?.repeatClassChoices).toEqual([]);
  });

  it('asks for a class when no class of that name exists on the campus', () => {
    const [group] = planGroups({
      students: [student('1', 'Okeke', { armId: 'j2-diamond-i' })],
      levels,
      arms,
    });
    expect(group?.toClass).toBeNull();
    expect(group?.classChoices.map((choice) => choice.id)).toEqual([
      'j3-gold-i',
      'j3-gold-l',
      'j3-silver-l',
    ]);
  });

  it('never offers or targets an archived class', () => {
    const [group] = planGroups({
      students: [student('1', 'Okeke')],
      levels,
      arms: arms.map((candidate) =>
        candidate.id === 'j3-gold-l'
          ? { ...candidate, retired: true }
          : candidate
      ),
    });
    expect(group?.toClass).toBeNull();
    expect(group?.classChoices.map((choice) => choice.id)).not.toContain(
      'j3-gold-l'
    );
    expect(group?.classChoices.map((choice) => choice.id)).not.toContain(
      'j3-old-l'
    );
  });

  it('treats a final-year level as Graduate with no target', () => {
    const [group] = planGroups({
      students: [
        student('1', 'Okeke', { levelId: 'ss3', armId: 'ss3-blue-i' }),
      ],
      levels,
      arms,
    });
    expect(group?.level).toEqual({
      id: 'ss3',
      name: 'SS 3',
      isFinalYear: true,
    });
    expect(group?.nextLevel).toBeNull();
    expect(group?.toClass).toBeNull();
    expect(group?.classChoices).toEqual([]);
  });

  it('asks for a repeat class when the current class is archived', () => {
    const archived = arms.map((candidate) =>
      candidate.id === 'j2-gold-l' ? { ...candidate, retired: true } : candidate
    );
    const [group] = planGroups({
      students: [student('1', 'Okeke')],
      levels,
      arms: archived,
    });
    expect(group?.fromClass?.archived).toBe(true);
    expect(group?.repeatClassChoices.map((choice) => choice.id)).toEqual([
      'j2-diamond-i',
    ]);
  });

  it('groups students without a placement under their level', () => {
    const groups = planGroups({
      students: [student('1', 'Okeke', { armId: null })],
      levels,
      arms,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.fromClass).toBeNull();
    expect(groups[0]?.toClass).toBeNull();
    expect(groups[0]?.repeatClassChoices.map((choice) => choice.id)).toEqual([
      'j2-diamond-i',
      'j2-gold-l',
    ]);
  });

  it('orders groups by level, then campus, then class, with no-class last in a level', () => {
    const groups = planGroups({
      students: [
        student('1', 'A', { levelId: 'ss3', armId: 'ss3-blue-i' }),
        student('2', 'B', { armId: null }),
        student('3', 'C', { armId: 'j2-diamond-i' }),
        student('4', 'D'),
      ],
      levels,
      arms,
    });
    expect(groups.map((group) => group.fromClass?.name ?? 'none')).toEqual([
      'JSS 2 Diamond',
      'JSS 2 Gold',
      'none',
      'SS 3 Blue',
    ]);
  });

  it('lists students by name and keeps inactive ones off the roster', () => {
    const [group] = planGroups({
      students: [
        student('1', 'Zed'),
        student('2', 'Adams'),
        student('3', 'Bello', { inactive: true }),
      ],
      levels,
      arms,
    });
    expect(group?.students.map((row) => row.lastName)).toEqual([
      'Adams',
      'Zed',
    ]);
    expect(group?.inactive).toEqual([{ id: '3', name: 'Ada Bello' }]);
  });
});

const level: RowLevelFacts = {
  levelId: 'j2',
  levelName: 'JSS 2',
  nextLevelId: 'j3',
  nextLevelName: 'JSS 3',
};
const finalLevel: RowLevelFacts = {
  levelId: 'ss3',
  levelName: 'SS 3',
  nextLevelId: null,
  nextLevelName: null,
};
const j3Arm = {
  id: 'j3-gold-l',
  levelId: 'j3',
  display: 'JSS 3 Gold',
  retired: false,
  campusId: 'lekki',
};
const j2Arm = {
  id: 'j2-gold-l',
  levelId: 'j2',
  display: 'JSS 2 Gold',
  retired: false,
  campusId: 'lekki',
};

describe('rowError', () => {
  it('accepts a move into the next level and a repeat in the same level', () => {
    expect(rowError({ outcome: 'move' }, level, j3Arm)).toBeNull();
    expect(rowError({ outcome: 'repeat' }, level, j2Arm)).toBeNull();
    expect(
      rowError({ outcome: 'repeat' }, finalLevel, {
        id: 'ss3-blue-i',
        campusId: 'ikeja',
        levelId: 'ss3',
        display: 'SS 3 Blue',
        retired: false,
      })
    ).toBeNull();
  });

  it('refuses a class at the wrong level', () => {
    expect(rowError({ outcome: 'move' }, level, j2Arm)).toBe(
      'Choose a JSS 3 class.'
    );
    expect(rowError({ outcome: 'repeat' }, level, j3Arm)).toBe(
      'Choose a JSS 2 class.'
    );
  });

  it('refuses an archived class', () => {
    expect(
      rowError({ outcome: 'move' }, level, { ...j3Arm, retired: true })
    ).toBe('JSS 3 Gold is archived. Choose another class.');
  });

  it('refuses a missing class', () => {
    expect(rowError({ outcome: 'move' }, level, undefined)).toBe(
      'Choose a JSS 3 class.'
    );
  });

  it('only lets a final-year student graduate, and only a final-year one', () => {
    expect(rowError({ outcome: 'graduate' }, finalLevel, undefined)).toBeNull();
    expect(rowError({ outcome: 'graduate' }, level, undefined)).toBe(
      'Only final-year students can graduate.'
    );
    expect(rowError({ outcome: 'move' }, finalLevel, j3Arm)).toBe(
      'Final-year students graduate; they cannot move up.'
    );
  });
});

describe('duplicateRowError', () => {
  it('refuses a student listed twice', () => {
    expect(
      duplicateRowError([{ studentId: 'a' }, { studentId: 'b' }])
    ).toBeNull();
    expect(duplicateRowError([{ studentId: 'a' }, { studentId: 'a' }])).toBe(
      'List each student once.'
    );
  });
});

describe('summarize', () => {
  it('counts each outcome', () => {
    expect(summarize(['move', 'move', 'repeat', 'graduate'])).toEqual({
      moved: 2,
      repeating: 1,
      graduated: 1,
    });
    expect(summarize([])).toEqual({ moved: 0, repeating: 0, graduated: 0 });
  });
});

const rowStudent = (
  id: string,
  overrides: Partial<StudentRowFacts> = {}
): StudentRowFacts => ({
  studentId: id,
  userId: null,
  name: `Student ${id}`,
  campusId: 'lekki',
  life: 'active',
  inTarget: false,
  level,
  ...overrides,
});

const targetArm: RowArmFacts = j3Arm;

const plan = (
  rows: Parameters<typeof planRows>[0]['rows'],
  students: StudentRowFacts[]
) =>
  planRows({
    rows,
    students: new Map(students.map((fact) => [fact.studentId, fact])),
    arms: new Map([
      ['j3-gold-l', targetArm],
      ['j2-gold-l', j2Arm],
    ]),
  });

describe('planRows', () => {
  it('plans a mover, a repeater and a graduate', () => {
    const result = plan(
      [
        { studentId: '1', outcome: 'move', classArmId: 'j3-gold-l' },
        { studentId: '2', outcome: 'repeat', classArmId: 'j2-gold-l' },
        { studentId: '3', outcome: 'graduate' },
      ],
      [
        rowStudent('1'),
        rowStudent('2'),
        rowStudent('3', { level: finalLevel, userId: 'u3' }),
      ]
    );
    expect(result).toEqual({
      ok: true,
      plan: {
        skipped: 0,
        enrolments: [
          {
            studentId: '1',
            outcome: 'move',
            levelId: 'j3',
            armId: 'j3-gold-l',
            campusId: 'lekki',
          },
          {
            studentId: '2',
            outcome: 'repeat',
            levelId: 'j2',
            armId: 'j2-gold-l',
            campusId: 'lekki',
          },
        ],
        graduates: [
          { id: '3', userId: 'u3', name: 'Student 3', campusId: 'lekki' },
        ],
      },
    });
  });

  it('skips archived, inactive, already enrolled and unenrolled students', () => {
    const result = plan(
      [
        { studentId: 'left', outcome: 'move', classArmId: 'j3-gold-l' },
        { studentId: 'away', outcome: 'move', classArmId: 'j3-gold-l' },
        { studentId: 'done', outcome: 'move', classArmId: 'j3-gold-l' },
        { studentId: 'none', outcome: 'move', classArmId: 'j3-gold-l' },
      ],
      [
        rowStudent('left', { life: 'left' }),
        rowStudent('away', { life: 'inactive' }),
        rowStudent('done', { inTarget: true }),
        rowStudent('none', { level: null }),
      ]
    );
    expect(result).toEqual({
      ok: true,
      plan: { skipped: 4, enrolments: [], graduates: [] },
    });
  });

  it('refuses everything when one row has the wrong level', () => {
    const result = plan(
      [
        { studentId: '1', outcome: 'move', classArmId: 'j3-gold-l' },
        { studentId: '2', outcome: 'move', classArmId: 'j2-gold-l' },
      ],
      [rowStudent('1'), rowStudent('2')]
    );
    expect(result).toEqual({ ok: false, error: 'Choose a JSS 3 class.' });
  });

  it('refuses a move that names no class the school knows', () => {
    const result = plan(
      [{ studentId: '1', outcome: 'move', classArmId: 'elsewhere' }],
      [rowStudent('1')]
    );
    expect(result).toEqual({ ok: false, error: 'Choose a JSS 3 class.' });
  });
});
