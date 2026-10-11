import { screen } from '@testing-library/react';
import { dashboardApi, renderInRouter, roll } from '../../test-dashboard';
import { RollCard, StudentsStat } from './roll-card';

describe('RollCard', () => {
  it('lists each status and opens Students on that tab', async () => {
    renderInRouter(<RollCard />, dashboardApi());
    expect(await screen.findByText('Students by status')).toBeInTheDocument();
    expect(screen.getByText('Admitted in 2026/2027')).toBeInTheDocument();
    expect(screen.getByText('2 due to be marked Left')).toBeInTheDocument();
    expect(screen.getByText('3 this term')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Inactive/ })).toHaveAttribute(
      'href',
      '/students?tab=inactive'
    );
    expect(screen.getByRole('link', { name: /^Active/ })).toHaveAttribute(
      'href',
      '/students'
    );
    expect(screen.getByRole('link', { name: /^Graduated/ })).toHaveAttribute(
      'href',
      '/students?tab=graduated'
    );
  });

  it('shows its own error', async () => {
    const api = dashboardApi();
    api.dashboard.roll.mockRejectedValue(new Error('The roll is unavailable'));
    renderInRouter(<RollCard />, api);
    expect(
      await screen.findByText('The roll is unavailable')
    ).toBeInTheDocument();
  });
});

describe('StudentsStat', () => {
  it('says across all campuses for a school-wide scope', async () => {
    renderInRouter(<StudentsStat />, dashboardApi());
    expect(await screen.findByText('312')).toBeInTheDocument();
    expect(screen.getByText('Across all campuses')).toBeInTheDocument();
  });

  it('names the campus for a campus-scoped member', async () => {
    renderInRouter(
      <StudentsStat />,
      dashboardApi({ roll: roll({ campusNames: ['Lekki'] }) })
    );
    expect(await screen.findByText('Lekki campus')).toBeInTheDocument();
  });

  it('says so when the member is on no campus', async () => {
    renderInRouter(
      <StudentsStat />,
      dashboardApi({ roll: roll({ active: 0, campusNames: [] }) })
    );
    expect(await screen.findByText('No campus yet')).toBeInTheDocument();
  });
});
