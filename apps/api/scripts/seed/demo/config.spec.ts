import {
  DEFAULT_DEMO_STUDENTS,
  DEFAULT_DEMO_TEACHERS,
  DEMO_ARM_COUNT,
  parseDemoSize,
} from './config';

describe('parseDemoSize', () => {
  it('defaults to 600 students and 30 teachers', () => {
    expect(parseDemoSize({})).toEqual({
      students: DEFAULT_DEMO_STUDENTS,
      teachers: DEFAULT_DEMO_TEACHERS,
    });
    expect(DEFAULT_DEMO_STUDENTS).toBe(600);
    expect(DEFAULT_DEMO_TEACHERS).toBe(30);
  });

  it('reads both sizes from the environment and ignores blanks', () => {
    expect(
      parseDemoSize({ SEED_DEMO_STUDENTS: '40', SEED_DEMO_TEACHERS: ' 4 ' })
    ).toEqual({ students: 40, teachers: 4 });
    expect(parseDemoSize({ SEED_DEMO_STUDENTS: '' }).students).toBe(600);
  });

  it.each(['0', '-5', '12.5', 'many', '1e3'])('rejects %s', (value) => {
    expect(() => parseDemoSize({ SEED_DEMO_TEACHERS: value })).toThrow(
      /SEED_DEMO_TEACHERS must be a positive whole number/
    );
  });

  it('needs a student for every class', () => {
    expect(() =>
      parseDemoSize({ SEED_DEMO_STUDENTS: String(DEMO_ARM_COUNT - 1) })
    ).toThrow(/at least 24/);
    expect(
      parseDemoSize({ SEED_DEMO_STUDENTS: String(DEMO_ARM_COUNT) }).students
    ).toBe(DEMO_ARM_COUNT);
  });
});
