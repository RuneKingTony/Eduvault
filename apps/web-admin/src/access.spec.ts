import { requireGate } from './access';
import { fakeAccess, starterAccess } from './test-utils';

const redirected = (run: () => void): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
};

describe('requireGate', () => {
  it('lets a member with the permission through', () => {
    expect(
      redirected(() => requireGate(starterAccess('teacher'), '/students'))
    ).toBeUndefined();
  });

  it('sends a member without it to the Dashboard', () => {
    const thrown = redirected(() =>
      requireGate(starterAccess('teacher'), '/fees')
    ) as { options: { to: string } };
    expect(thrown.options.to).toBe('/');
  });

  it('sends a member with no permissions away from every gated route', () => {
    for (const route of ['/students', '/campuses', '/fees']) {
      expect(redirected(() => requireGate(fakeAccess(), route))).toBeDefined();
    }
  });

  it('leaves ungated routes open', () => {
    for (const route of ['/', '/approvals']) {
      expect(
        redirected(() => requireGate(fakeAccess(), route))
      ).toBeUndefined();
    }
  });
});
