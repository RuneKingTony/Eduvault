import { screen } from '@testing-library/react';
import type { PlatformSchool } from '@eduvault/api-contract';
import { renderWithApi } from '../test-utils';
import { PlatformSchoolsPage } from './platform-schools-page';

const school = (overrides: Partial<PlatformSchool> = {}): PlatformSchool => ({
  id: 's1',
  name: 'Greenfield College',
  slug: 'greenfield',
  admissionPrefix: 'GF',
  city: 'Lagos',
  owners: [{ id: 'o1', name: 'Funmi Adeyemi', email: 'funmi@greenfield.test' }],
  createdAt: '2026-08-12T10:00:00.000Z',
  ...overrides,
});

const apiWith = (items: PlatformSchool[]) => ({
  platform: { schools: { list: vi.fn().mockResolvedValue({ items }) } },
});

describe('PlatformSchoolsPage', () => {
  it('shows the head, the count and a row per school', async () => {
    renderWithApi(
      <PlatformSchoolsPage />,
      apiWith([
        school(),
        school({
          id: 's2',
          name: 'Hilltop Academy',
          slug: 'hilltop',
          city: null,
          owners: [],
        }),
      ])
    );

    expect(
      await screen.findByRole('heading', { name: 'Schools' })
    ).toBeInTheDocument();
    expect(
      await screen.findByText('2 schools on Eduvault')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Only a super admin creates schools.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create school' })
    ).toBeInTheDocument();

    expect(screen.getByText('greenfield')).toHaveClass('font-mono');
    expect(screen.getByText('Funmi Adeyemi')).toBeInTheDocument();
    expect(screen.getByText('funmi@greenfield.test')).toBeInTheDocument();
    expect(screen.getByText('Lagos')).toBeInTheDocument();
    expect(screen.getAllByText('12 Aug 2026')).toHaveLength(2);
    expect(screen.getByText('Hilltop Academy')).toBeInTheDocument();
  });

  it('says there is nothing yet when no school exists', async () => {
    renderWithApi(<PlatformSchoolsPage />, apiWith([]));
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('0 schools on Eduvault')).toBeInTheDocument();
  });
});
