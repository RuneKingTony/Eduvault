import type { Me } from '@eduvault/api-contract';
import { entryState } from './entry-state';

const me = (overrides: Partial<Me> = {}): Me => ({
  user: { id: 'u1', email: 'a@school.test', name: 'Ada' },
  activeOrganizationId: 'o1',
  activeCampusId: null,
  mustChangePassword: false,
  platformRole: null,
  schoolCount: 1,
  suspendedSchool: null,
  ...overrides,
});

const signedIn = {
  isPending: false,
  data: { session: { activeOrganizationId: 'o1' } },
};
const loaded = (data: Me) => ({ isPending: false, data });

describe('entryState', () => {
  it('waits for the session, then the person', () => {
    expect(
      entryState({
        session: { isPending: true, data: undefined },
        me: { isPending: true, data: undefined },
      })
    ).toBe('loading');
    expect(
      entryState({
        session: signedIn,
        me: { isPending: true, data: undefined },
      })
    ).toBe('loading');
  });

  it('sends a signed-out visitor to sign in', () => {
    expect(
      entryState({
        session: { isPending: false, data: null },
        me: { isPending: false, data: undefined },
      })
    ).toBe('signed-out');
  });

  it('puts the temporary password first, ahead of the platform and a school', () => {
    expect(
      entryState({
        session: signedIn,
        me: loaded(
          me({ mustChangePassword: true, platformRole: 'superadmin' })
        ),
        platform: true,
      })
    ).toBe('change-password');
  });

  it('shows the platform only where it is asked for', () => {
    const superAdmin = loaded(
      me({ platformRole: 'superadmin', schoolCount: 0 })
    );
    expect(
      entryState({
        session: { isPending: false, data: { session: {} } },
        me: superAdmin,
        platform: true,
      })
    ).toBe('platform');
    expect(
      entryState({
        session: { isPending: false, data: { session: {} } },
        me: superAdmin,
      })
    ).toBe('no-school');
  });

  it('has no school without a membership or an active school', () => {
    expect(
      entryState({ session: signedIn, me: loaded(me({ schoolCount: 0 })) })
    ).toBe('no-school');
    expect(
      entryState({
        session: {
          isPending: false,
          data: { session: { activeOrganizationId: null } },
        },
        me: loaded(me()),
      })
    ).toBe('no-school');
  });

  it('is suspended when the active school is paused, after no-school and before ready', () => {
    const paused = me({ suspendedSchool: { id: 'o1', name: 'Greenfield' } });
    expect(entryState({ session: signedIn, me: loaded(paused) })).toBe(
      'suspended'
    );
    expect(
      entryState({
        session: signedIn,
        me: loaded({ ...paused, schoolCount: 0 }),
      })
    ).toBe('no-school');
    expect(
      entryState({
        session: signedIn,
        me: loaded({ ...paused, platformRole: 'superadmin' }),
        platform: true,
      })
    ).toBe('platform');
  });

  it('is ready with a school', () => {
    expect(entryState({ session: signedIn, me: loaded(me()) })).toBe('ready');
  });
});
