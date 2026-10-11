import { ARM_J3, newSchoolYearPreview } from '../test-students';
import {
  EMPTY_SELECTION,
  canStart,
  groupErrors,
  groupKeyOf,
  groupLabel,
  moveTarget,
  repeatTarget,
  startRows,
  startedToast,
  summarize,
  summaryText,
  type StartSelection,
} from './start-year-model';

const preview = newSchoolYearPreview();
const [gold, blue] = preview.groups;
if (gold === undefined || blue === undefined) {
  throw new Error('fixture needs two groups');
}

const repeating = (...ids: string[]): StartSelection => ({
  ...EMPTY_SELECTION,
  repeating: new Set(ids),
});

describe('summary', () => {
  it('ticks everyone by default: movers move up and the final year graduates', () => {
    expect(summarize(preview, EMPTY_SELECTION)).toEqual({
      moveUp: 2,
      repeat: 0,
      graduate: 1,
    });
    expect(summaryText(summarize(preview, EMPTY_SELECTION))).toBe(
      '2 move up · 0 repeat · 1 graduate'
    );
  });

  it('counts an unticked student as repeating', () => {
    expect(summarize(preview, repeating('s2'))).toEqual({
      moveUp: 1,
      repeat: 1,
      graduate: 1,
    });
  });

  it('leaves a locked final-year group out without student:archive', () => {
    expect(
      summarize({ ...preview, canGraduate: false }, EMPTY_SELECTION)
    ).toEqual({ moveUp: 2, repeat: 0, graduate: 0 });
  });
});

describe('targets and errors', () => {
  it('uses the same-name class and keeps repeaters in their own class', () => {
    expect(moveTarget(gold, EMPTY_SELECTION)).toBe(ARM_J3);
    expect(repeatTarget(gold, EMPTY_SELECTION)).toBe(gold.fromClass?.id);
  });

  it('asks for a class when none shares the name', () => {
    const open = { ...gold, toClass: null };
    expect(moveTarget(open, EMPTY_SELECTION)).toBeNull();
    expect(groupErrors(open, EMPTY_SELECTION).move).toBe(
      'Choose a class for JSS 2 Gold (Lekki).'
    );
    expect(
      moveTarget(open, {
        ...EMPTY_SELECTION,
        targets: { [groupKeyOf(open)]: 'picked' },
      })
    ).toBe('picked');
  });

  it('asks for a repeat class when the current class is archived', () => {
    const archived = {
      ...gold,
      fromClass: gold.fromClass && { ...gold.fromClass, archived: true },
    };
    const selection = repeating('s2');
    expect(repeatTarget(archived, selection)).toBeNull();
    expect(groupErrors(archived, selection).repeat).toBe(
      'Choose a class for those repeating in JSS 2 Gold (Lekki).'
    );
    expect(groupErrors(archived, EMPTY_SELECTION).repeat).toBeNull();
  });

  it('names a group without a class by its level', () => {
    expect(groupLabel({ ...gold, fromClass: null })).toBe('JSS 2 · no class');
  });

  it('only allows Start once every needed class is chosen', () => {
    expect(canStart(preview, EMPTY_SELECTION)).toBe(true);
    expect(
      canStart(
        { ...preview, groups: [{ ...gold, toClass: null }, blue] },
        EMPTY_SELECTION
      )
    ).toBe(false);
    expect(canStart({ ...preview, groups: [] }, EMPTY_SELECTION)).toBe(false);
  });
});

describe('request rows', () => {
  it('builds a move, a repeat and a graduate row', () => {
    expect(startRows(preview, repeating('s2'))).toEqual([
      { studentId: 's1', outcome: 'move', classArmId: ARM_J3 },
      { studentId: 's2', outcome: 'repeat', classArmId: gold.fromClass?.id },
      { studentId: 's3', outcome: 'graduate' },
    ]);
  });

  it('leaves a locked group out of the request', () => {
    expect(
      startRows({ ...preview, canGraduate: false }, EMPTY_SELECTION).map(
        (row) => row.studentId
      )
    ).toEqual(['s1', 's2']);
  });
});

describe('startedToast', () => {
  it('adds the first-term clause until that term is current', () => {
    const result = { moved: 1, repeating: 1, graduated: 1 };
    expect(startedToast(preview, result)).toBe(
      '2027/2028 started: 1 moved up, 1 repeating, 1 graduated. Their new classes show once First term is made current.'
    );
    expect(
      startedToast(
        {
          ...preview,
          targetYear: {
            ...preview.targetYear,
            firstTerm: { ...preview.targetYear.firstTerm, isCurrent: true },
          },
        },
        result
      )
    ).toBe('2027/2028 started: 1 moved up, 1 repeating, 1 graduated.');
  });
});
