import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases, strips accents and collapses separators', () => {
    expect(slugify('  École Nationale -- Nº 1 ')).toBe('ecole-nationale-no-1');
  });

  it('returns an empty string when nothing slug-safe remains', () => {
    expect(slugify('!!!')).toBe('');
  });
});
