import { render, screen, within } from '@testing-library/react';
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
    const header = within(screen.getByRole('banner'));
    const open = header.getByRole('button', { name: 'Open navigation' });
    const breadcrumb = header.getByRole('navigation', { name: 'Breadcrumb' });
    const search = header.getByRole('button', { name: 'Search' });
    expect(open.compareDocumentPosition(breadcrumb)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(breadcrumb.compareDocumentPosition(search)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});
