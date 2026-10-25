import { screen, within } from '@testing-library/react';
import { SidebarProvider } from '@eduvault/ui';
import { NAV_GROUPS, visibleNav } from '../nav';
import { approvalSummary } from '../test-approvals';
import { renderPayments } from '../test-payments';
import { starterAccess } from '../test-utils';
import { SidebarNav } from './sidebar-nav';

const BUILT = new Set([
  '/',
  '/approvals',
  '/announcements',
  '/finance/school-fees',
  '/finance/payments',
  '/finance/money-accounts',
  '/finance/store',
  '/finance/wallets',
]);

function setup(
  slug: string,
  summary = approvalSummary({
    waitingForMe: 3,
    byNav: { approvals: 3, payments: 3, store: 0, wallets: 0 },
  })
) {
  const access = starterAccess(slug);
  const api = { approvals: { summary: vi.fn().mockResolvedValue(summary) } };
  const groups = visibleNav(NAV_GROUPS, BUILT, access.permissions);
  renderPayments(
    <SidebarProvider>
      <SidebarNav
        groups={groups}
        pathname="/approvals"
        rail={false}
        onNavigate={() => undefined}
      />
    </SidebarProvider>,
    api,
    { access, path: '/approvals' }
  );
  return api;
}

const countOn = (label: string) => {
  const link = new RegExp(`^${label}`);
  const item = screen
    .getAllByRole('listitem')
    .find((candidate) => within(candidate).queryByRole('link', { name: link }));
  if (item === undefined) {
    throw new Error(`No nav item for ${label}`);
  }
  return within(item);
};

describe('SidebarNav counts', () => {
  it('shows what the viewer can decide on Approvals and on Payments', async () => {
    setup('principal');

    expect(await screen.findAllByLabelText('3 waiting for you')).toHaveLength(
      2
    );
    expect(countOn('Approvals').getByText('3')).toBeVisible();
    expect(countOn('Payments').getByText('3')).toBeVisible();
    expect(countOn('Dashboard').queryByText('3')).toBeNull();
  });

  it('shows a store write-off on Store and the money kinds on Payments', async () => {
    setup(
      'principal',
      approvalSummary({
        waitingForMe: 3,
        byNav: { approvals: 3, payments: 2, store: 1, wallets: 0 },
      })
    );

    expect(await screen.findByLabelText('1 waiting for you')).toBeVisible();
    expect(countOn('Store').getByText('1')).toBeVisible();
    expect(countOn('Payments').getByText('2')).toBeVisible();
    expect(countOn('Approvals').getByText('3')).toBeVisible();
  });

  it('shows wallet refunds and cancelled top-ups on Wallets, and not on Payments', async () => {
    setup(
      'principal',
      approvalSummary({
        waitingForMe: 3,
        byNav: { approvals: 3, payments: 1, store: 0, wallets: 2 },
      })
    );

    expect(await screen.findByLabelText('2 waiting for you')).toBeVisible();
    expect(countOn('Wallets').getByText('2')).toBeVisible();
    expect(countOn('Payments').getByText('1')).toBeVisible();
    expect(countOn('Approvals').getByText('3')).toBeVisible();
  });

  it('shows no count when nothing waits', async () => {
    const api = setup(
      'principal',
      approvalSummary({
        waitingForMe: 0,
        byNav: { approvals: 0, payments: 0, store: 0, wallets: 0 },
        preview: [],
      })
    );
    await screen.findByRole('link', { name: /^Approvals/ });
    await vi.waitFor(() => {
      expect(api.approvals.summary).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText(/waiting for you/)).toBeNull();
  });

  it('shows no count to a member who cannot approve, and asks nothing', async () => {
    const api = setup('bursar');
    await screen.findByRole('link', { name: /^Payments/ });
    expect(screen.queryByLabelText(/waiting for you/)).toBeNull();
    expect(api.approvals.summary).not.toHaveBeenCalled();
  });
});
