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

  it('keeps the card as it was without the owed fields', async () => {
    renderInRouter(<RollCard />, dashboardApi());
    expect(await screen.findByText('Students by status')).toBeInTheDocument();
    expect(screen.queryByText(/Owed/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no longer at the school/)
    ).not.toBeInTheDocument();
  });

  it('shows an Owed figure per row, with a dash at zero, for a finance reader', async () => {
    renderInRouter(
      <RollCard />,
      dashboardApi({
        roll: roll({
          currency: 'NGN',
          owedMinor: {
            active: 25_000_000,
            newIntakes: 4_000_000,
            inactive: 0,
            left: 1_500_000,
            graduated: 0,
          },
          formerOwedMinor: 1_500_000,
        }),
      })
    );
    expect(
      await screen.findByText('Students and what they owe')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'New intakes are part of Active. Nobody is deleted, so balances stay counted.'
      )
    ).toBeInTheDocument();
    const row = (name: RegExp) => screen.getByRole('link', { name });
    expect(row(/^Active/)).toHaveTextContent('Owed ₦250,000');
    expect(row(/^New intakes/)).toHaveTextContent('Owed ₦40,000');
    expect(row(/^Inactive/)).toHaveTextContent('Owed —');
    expect(row(/^Left/)).toHaveTextContent('Owed ₦15,000');
    expect(row(/^Graduated/)).toHaveTextContent('Owed —');
    expect(
      screen.getByText(
        '₦15,000 of what is owed is from students no longer at the school.'
      )
    ).toBeInTheDocument();
  });

  it('leaves the former-students note out when none of them owes', async () => {
    renderInRouter(
      <RollCard />,
      dashboardApi({
        roll: roll({
          currency: 'NGN',
          owedMinor: {
            active: 25_000_000,
            newIntakes: 0,
            inactive: 0,
            left: 0,
            graduated: 0,
          },
          formerOwedMinor: 0,
        }),
      })
    );
    expect(
      await screen.findByText('Students and what they owe')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no longer at the school/)
    ).not.toBeInTheDocument();
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
