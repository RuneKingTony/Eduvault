import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { DevUiPage } from './dev-ui-page';

describe('DevUiPage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
  });

  it('shows every gallery section and the whole nav model', async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: DevUiPage }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(<RouterProvider router={router} />);
    for (const heading of [
      'Tokens',
      'Type scale',
      'Money colours and contrast',
      'Navigation model',
      'Shell pieces',
    ]) {
      expect(
        await screen.findByRole('heading', { name: heading })
      ).toBeInTheDocument();
    }
    expect(screen.getByText('Staff and members')).toBeInTheDocument();
    expect(screen.getByText('Approvals')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Switch to/ })
    ).toBeInTheDocument();
  });
});
