import { initials } from './initials';

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Funmi Adeyemi')).toBe('FA');
    expect(initials('Ada Nkem Okeke')).toBe('AN');
  });

  it('upper-cases and copes with one word, padding and nothing', () => {
    expect(initials('ada')).toBe('A');
    expect(initials('  ngozi   okeke ')).toBe('NO');
    expect(initials('')).toBe('');
  });
});
