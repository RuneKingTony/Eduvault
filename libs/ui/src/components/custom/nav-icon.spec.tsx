import { render } from '@testing-library/react';
import { NavIcon } from './nav-icon';

describe('NavIcon', () => {
  it('draws the users-round icon the portal uses for My children', () => {
    const { container } = render(<NavIcon name="users-round" />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(container.querySelector('svg')).toHaveClass('lucide-users-round');
  });
});
