import { DEFAULT_LEVELS } from './default-levels';

describe('DEFAULT_LEVELS', () => {
  it('runs from Primary 1 to SS 3 in twelve consecutive years', () => {
    expect(DEFAULT_LEVELS.map((level) => level.code)).toEqual([
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
      'P6',
      'JSS1',
      'JSS2',
      'JSS3',
      'SS1',
      'SS2',
      'SS3',
    ]);
    expect(DEFAULT_LEVELS.map((level) => level.sequence)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1)
    );
  });

  it('names the first and the final year', () => {
    expect(DEFAULT_LEVELS[0]?.name).toBe('Primary 1');
    expect(DEFAULT_LEVELS.at(-1)).toEqual({
      code: 'SS3',
      name: 'SS 3',
      sequence: 12,
    });
  });
});
