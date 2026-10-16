import {
  applicableLines,
  type FeeLineFacts,
  type StudentFeeFacts,
} from './applicable-lines';

interface TestLine extends FeeLineFacts {
  id: string;
}

const line = (id: string, over: Partial<TestLine> = {}): TestLine => ({
  id,
  feeTypeId: 'tuition',
  termId: 'term-1',
  classLevelId: 'jss2',
  campusId: null,
  appliesTo: 'all',
  isOptional: false,
  retiredAt: null,
  ...over,
});

const student = (over: Partial<StudentFeeFacts> = {}): StudentFeeFacts => ({
  termId: 'term-1',
  classLevelId: 'jss2',
  campusId: 'ikeja',
  isNew: false,
  optedInFeeTypeIds: new Set(),
  ...over,
});

const idsOf = (lines: readonly TestLine[]) => lines.map((row) => row.id);

describe('applicableLines', () => {
  it('keeps live lines of the term and level for the every-campus fee', () => {
    const lines = [
      line('base'),
      line('other-term', { termId: 'term-2' }),
      line('other-level', { classLevelId: 'jss1' }),
    ];
    expect(idsOf(applicableLines(lines, student()))).toEqual(['base']);
  });

  it('drops retired lines', () => {
    const lines = [line('gone', { retiredAt: '2026-10-01T00:00:00.000Z' })];
    expect(applicableLines(lines, student())).toEqual([]);
  });

  it('matches a campus line only to a student on that campus', () => {
    const lines = [line('ikeja-only', { campusId: 'ikeja' })];
    expect(idsOf(applicableLines(lines, student()))).toEqual(['ikeja-only']);
    expect(applicableLines(lines, student({ campusId: 'lekki' }))).toEqual([]);
  });

  it('lets a campus line replace the every-campus line of the same fee type', () => {
    const lines = [line('base'), line('override', { campusId: 'ikeja' })];
    expect(idsOf(applicableLines(lines, student()))).toEqual(['override']);
    expect(
      idsOf(applicableLines(lines, student({ campusId: 'lekki' })))
    ).toEqual(['base']);
  });

  it('applies the override whatever order the lines arrive in', () => {
    const lines = [line('override', { campusId: 'ikeja' }), line('base')];
    expect(idsOf(applicableLines(lines, student()))).toEqual(['override']);
  });

  it('checks eligibility before the override, so a new-only override lets the base through for a returning student', () => {
    const lines = [
      line('base'),
      line('override', { campusId: 'ikeja', appliesTo: 'new' }),
    ];
    expect(idsOf(applicableLines(lines, student({ isNew: false })))).toEqual([
      'base',
    ]);
    expect(idsOf(applicableLines(lines, student({ isNew: true })))).toEqual([
      'override',
    ]);
  });

  it('keeps new-only lines for a new student and returning-only lines for a returning one', () => {
    const lines = [
      line('everyone', { feeTypeId: 'pta' }),
      line('new-only', { feeTypeId: 'levy', appliesTo: 'new' }),
      line('returning-only', { feeTypeId: 'dues', appliesTo: 'returning' }),
    ];
    expect(idsOf(applicableLines(lines, student({ isNew: true })))).toEqual([
      'everyone',
      'new-only',
    ]);
    expect(idsOf(applicableLines(lines, student({ isNew: false })))).toEqual([
      'everyone',
      'returning-only',
    ]);
  });

  it('keeps an optional line only for a student who opted in to that fee type', () => {
    const lines = [line('bus', { feeTypeId: 'bus', isOptional: true })];
    expect(applicableLines(lines, student())).toEqual([]);
    expect(
      idsOf(
        applicableLines(lines, student({ optedInFeeTypeIds: new Set(['bus']) }))
      )
    ).toEqual(['bus']);
    expect(
      applicableLines(
        lines,
        student({ optedInFeeTypeIds: new Set(['boarding']) })
      )
    ).toEqual([]);
  });

  it('honours an opt-in for the campus override too', () => {
    const lines = [
      line('base-bus', { feeTypeId: 'bus', isOptional: true }),
      line('ikeja-bus', {
        feeTypeId: 'bus',
        isOptional: true,
        campusId: 'ikeja',
      }),
    ];
    expect(
      idsOf(
        applicableLines(lines, student({ optedInFeeTypeIds: new Set(['bus']) }))
      )
    ).toEqual(['ikeja-bus']);
  });

  it('opts in across terms because the opt-in is by fee type, not by line', () => {
    const second = [
      line('second-term-bus', {
        feeTypeId: 'bus',
        isOptional: true,
        termId: 'term-2',
      }),
    ];
    expect(
      idsOf(
        applicableLines(
          second,
          student({ termId: 'term-2', optedInFeeTypeIds: new Set(['bus']) })
        )
      )
    ).toEqual(['second-term-bus']);
  });

  it('keeps one line per fee type', () => {
    const lines = [
      line('tuition'),
      line('pta', { feeTypeId: 'pta' }),
      line('pta-ikeja', { feeTypeId: 'pta', campusId: 'ikeja' }),
    ];
    expect(idsOf(applicableLines(lines, student()))).toEqual([
      'tuition',
      'pta-ikeja',
    ]);
  });
});
