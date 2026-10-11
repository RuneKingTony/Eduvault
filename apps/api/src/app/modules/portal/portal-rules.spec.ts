import { firstNameOf, portalKindOf, realEmail } from './portal-rules';

describe('portalKindOf', () => {
  it('is student when the caller has a student row, else guardian', () => {
    expect(portalKindOf(true)).toBe('student');
    expect(portalKindOf(false)).toBe('guardian');
  });
});

describe('realEmail', () => {
  it('hides the placeholder address of a username login', () => {
    expect(realEmail('0b0c8a8e@users.eduvault.invalid')).toBeNull();
    expect(realEmail('0B0C8A8E@USERS.EDUVAULT.INVALID')).toBeNull();
  });

  it('keeps a real address', () => {
    expect(realEmail('ngozi@example.com')).toBe('ngozi@example.com');
  });
});

describe('firstNameOf', () => {
  it('prefers the student’s own first name', () => {
    expect(firstNameOf('Mary Jane Okeke', 'Mary Jane')).toBe('Mary Jane');
  });

  it('takes the first word of a guardian’s name', () => {
    expect(firstNameOf('  Ngozi Okeke ', null)).toBe('Ngozi');
    expect(firstNameOf('Ngozi', null)).toBe('Ngozi');
  });
});
