import { render, screen } from '@testing-library/react';
import { AppTopbar } from './app-topbar';

describe('AppTopbar', () => {
  it('holds start controls, the breadcrumb and end controls in order', () => {
    render(
      <AppTopbar
        start={<button type="button">Open navigation</button>}
        end={<button type="button">Search</button>}
      >
        <nav aria-label="Breadcrumb">Students</nav>
      </AppTopbar>
    );
    const header = screen.getByRole('banner');
    const order = [...header.querySelectorAll('button, nav')].map(
      (node) => node.textContent
    );
    expect(order).toEqual(['Open navigation', 'Students', 'Search']);
  });
});
