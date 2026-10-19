import { fireEvent, render, screen } from '@testing-library/react';
import { NoSchoolScreen } from './no-school-screen';

describe('NoSchoolScreen', () => {
  it('tells staff to ask the school owner', () => {
    const onSignOut = vi.fn();
    render(<NoSchoolScreen variant="staff" onSignOut={onSignOut} />);
    expect(screen.getByText('You’re not in a school yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('tells a portal user to ask the school', () => {
    render(<NoSchoolScreen variant="portal" onSignOut={vi.fn()} />);
    expect(
      screen.getByText('You’re not linked to a school yet')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out' })
    ).toBeInTheDocument();
  });
});
