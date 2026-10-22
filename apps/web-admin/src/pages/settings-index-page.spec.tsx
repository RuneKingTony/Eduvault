import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsIndexPage } from './settings-index-page';

describe('SettingsIndexPage', () => {
  it('lists each item the person can open and opens the one clicked', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <SettingsIndexPage
        items={[
          {
            id: 'campuses',
            label: 'Campuses',
            route: '/campuses',
            group: 'School structure',
            icon: 'building',
          },
        ]}
        onOpen={onOpen}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Settings' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('The parts of the school set-up you can open.')
    ).toBeInTheDocument();
    expect(screen.getByText('Your settings')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Campuses' }));
    expect(onOpen).toHaveBeenCalledWith('/campuses');
  });
});
