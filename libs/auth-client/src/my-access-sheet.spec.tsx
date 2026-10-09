import { render, screen } from '@testing-library/react';
import { accessOfStarter, fakeAccess } from './access-test-utils';
import { MyAccessSheet } from './my-access-sheet';
import { PermissionsProvider } from './permissions';
import type { MePermissions } from '@eduvault/api-contract';

const user = { name: 'Tunde Bakare', email: 'tunde@school.test', image: null };

function renderSheet(access: MePermissions, campusNames: string[] = []) {
  render(
    <PermissionsProvider value={access}>
      <MyAccessSheet
        open
        onOpenChange={vi.fn()}
        user={user}
        schoolName="Greenfield College"
        campusNames={campusNames}
      />
    </PermissionsProvider>
  );
}

describe('MyAccessSheet', () => {
  it('describes an administrator by role, campuses and what they can do', () => {
    renderSheet(accessOfStarter('administrator'));
    expect(screen.getByText('My access')).toBeInTheDocument();
    expect(
      screen.getByText('What you can do in Greenfield College, and why.')
    ).toBeInTheDocument();
    expect(screen.getByText('Tunde Bakare')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Every campus')).toBeInTheDocument();
    expect(screen.getByText('Campuses: can see')).toBeInTheDocument();
    expect(screen.getByText('Sees every campus')).toBeInTheDocument();
    expect(screen.getByText('School settings: can see')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Students: admit students, update them and put them in classes'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Classes')).not.toBeInTheDocument();
  });

  it('says there is nothing yet for a member with no roles', () => {
    renderSheet(fakeAccess({ campusScope: ['c1'] }), ['Lekki']);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Lekki')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing yet. Ask the owner to give you a role.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Member')).not.toBeInTheDocument();
  });
});
