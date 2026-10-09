import { suggestPrefix, suggestSlug } from './platform-suggestions';

describe('suggestSlug', () => {
  it('lowercases, hyphenates and trims to 40 characters', () => {
    expect(suggestSlug("St Brendan's Schools")).toBe('st-brendan-s-schools');
    expect(suggestSlug('A'.repeat(60))).toHaveLength(40);
  });

  it('never ends on a hyphen', () => {
    expect(suggestSlug(`${'a'.repeat(39)} b`)).toBe('a'.repeat(39));
  });
});

describe('suggestPrefix', () => {
  it('takes the capital initials of the name', () => {
    expect(suggestPrefix('Greenfield College')).toBe('GC');
    expect(suggestPrefix('Hilltop Academy Abuja Main')).toBe('HAAM');
  });

  it('falls back to the first letters of a one-word name', () => {
    expect(suggestPrefix('Hilltop')).toBe('HILLTO');
    expect(suggestPrefix('A')).toBe('A');
  });

  it('is empty until there are letters', () => {
    expect(suggestPrefix('')).toBe('');
    expect(suggestPrefix('123')).toBe('');
  });
});
