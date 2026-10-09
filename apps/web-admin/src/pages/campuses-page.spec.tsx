import { screen } from '@testing-library/react';
import { renderWithApi, starterAccess } from '../test-utils';
import { CampusesPage } from './campuses-page';

const campus = {
  id: '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c33',
  organizationId: '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
  name: 'Main Campus',
  address: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const campuses = { campuses: { list: vi.fn().mockResolvedValue([campus]) } };

describe('CampusesPage', () => {
  it('shows the add form with team:create', async () => {
    renderWithApi(<CampusesPage />, campuses, starterAccess('administrator'));
    expect(await screen.findByText('Main Campus')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add campus' })
    ).toBeInTheDocument();
  });

  it('hides the add form without team:create', async () => {
    renderWithApi(<CampusesPage />, campuses, starterAccess('principal'));
    expect(await screen.findByText('Main Campus')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add campus' })
    ).not.toBeInTheDocument();
  });
});
