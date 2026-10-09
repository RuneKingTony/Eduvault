import { render, screen } from '@testing-library/react';
import { SchoolCrest } from './school-crest';

describe('SchoolCrest', () => {
  it('shows the school initials when there is no logo', () => {
    render(<SchoolCrest name="Greenfield College" initials="GC" />);
    expect(
      screen.getByRole('img', { name: 'Greenfield College crest' })
    ).toHaveTextContent('GC');
  });

  it('shows the logo when one is set', () => {
    render(
      <SchoolCrest
        name="Greenfield College"
        initials="GC"
        logoUrl="/logo.png"
      />
    );
    expect(
      screen.getByRole('img', { name: 'Greenfield College logo' })
    ).toHaveAttribute('src', '/logo.png');
  });
});
