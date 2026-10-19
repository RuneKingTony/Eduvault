import { fireEvent, render, screen } from '@testing-library/react';
import { SuspendedScreen } from './suspended-screen';

describe('SuspendedScreen', () => {
  it('names the paused school and offers sign out', () => {
    const onSignOut = vi.fn();
    render(
      <SuspendedScreen
        schoolName="St Brendan’s"
        variant="staff"
        onSignOut={onSignOut}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByText('St Brendan’s is paused on Eduvault')
    ).toBeInTheDocument();
    expect(screen.getByText('Contact the school for details.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('offers to check again, for a school reactivated meanwhile', () => {
    const onRetry = vi.fn();
    render(
      <SuspendedScreen
        schoolName="St Brendan’s"
        variant="staff"
        onSignOut={vi.fn()}
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the switcher it is given before the other actions', () => {
    render(
      <SuspendedScreen
        schoolName="St Brendan’s"
        variant="portal"
        onSignOut={vi.fn()}
        onRetry={vi.fn()}
        switcher={<button type="button">Switch school</button>}
      />
    );
    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual(['Switch school', 'Check again', 'Sign out']);
  });

  it('offers only Check again and Sign out when no switcher is given', () => {
    render(
      <SuspendedScreen
        schoolName="St Brendan’s"
        variant="portal"
        onSignOut={vi.fn()}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual(['Check again', 'Sign out']);
  });
});
