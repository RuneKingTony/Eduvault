import { landingRedirect } from './default-page';
import { ADA_ID } from './test-utils';

describe('landingRedirect', () => {
  it('sends a guardian on / with no child to My children', () => {
    expect(
      landingRedirect({ kind: 'guardian', path: '/', child: undefined })
    ).toBe('/children');
  });

  it('keeps a guardian on Home when a child is chosen', () => {
    expect(
      landingRedirect({ kind: 'guardian', path: '/', child: ADA_ID })
    ).toBeUndefined();
  });

  it('keeps a guardian on My children', () => {
    expect(
      landingRedirect({ kind: 'guardian', path: '/children', child: undefined })
    ).toBeUndefined();
  });

  it('sends a student on /children to Home', () => {
    expect(
      landingRedirect({ kind: 'student', path: '/children', child: undefined })
    ).toBe('/');
  });

  it('keeps a student on Home', () => {
    expect(
      landingRedirect({ kind: 'student', path: '/', child: undefined })
    ).toBeUndefined();
  });
});
