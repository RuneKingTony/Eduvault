import { screen, within } from '@testing-library/react';
import { renderPayments } from '../test-payments';
import { starterAccess } from '../test-utils';
import { PaymentsLayout } from './finance-layout';

function setup(slug: string, path = '/finance/payments') {
  renderPayments(
    <PaymentsLayout>
      <p>The page</p>
    </PaymentsLayout>,
    {},
    { access: starterAccess(slug), path }
  );
}

describe('PaymentsLayout', () => {
  it('shows Payments and Discounts and refunds to someone who can open both', async () => {
    setup('bursar');
    const nav = await screen.findByRole('navigation', { name: 'Payments' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')])
    ).toEqual([
      ['Payments', '/finance/payments'],
      ['Discounts and refunds', '/finance/adjustments'],
    ]);
    expect(screen.getByText('The page')).toBeVisible();
  });

  it('marks the tab of the page the viewer is on', async () => {
    setup('principal', '/finance/adjustments');
    const nav = await screen.findByRole('navigation', { name: 'Payments' });
    expect(
      within(nav).getByRole('link', { name: 'Discounts and refunds' })
    ).toHaveClass('bg-muted');
    expect(within(nav).getByRole('link', { name: 'Payments' })).not.toHaveClass(
      'bg-muted'
    );
  });

  it('shows no strip when the viewer can open only one of them', async () => {
    setup('administrator');
    expect(await screen.findByText('The page')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Payments' })).toBeNull();
  });
});
