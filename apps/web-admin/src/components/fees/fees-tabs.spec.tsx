import { screen, waitFor, within } from '@testing-library/react';
import { feesApi, renderFees, TERM_2 } from '../../test-fees';
import { fakeAccess, starterAccess } from '../../test-utils';
import { FEE_TABS, FeesTabs } from './fees-tabs';

describe('FeesTabs', () => {
  it('lists School fees then Other fees for a member who reads fees', async () => {
    renderFees(
      <FeesTabs term={undefined} />,
      feesApi(),
      starterAccess('administrator')
    );
    const tabs = await screen.findByRole('navigation', { name: 'Fees' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['School fees', 'Other fees']);
  });

  it('carries the chosen term to both tabs', async () => {
    renderFees(<FeesTabs term={TERM_2} />, feesApi());
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Other fees' })).toHaveAttribute(
        'href',
        `/finance/other-fees?term=${TERM_2}`
      );
    });
    expect(screen.getByRole('link', { name: 'School fees' })).toHaveAttribute(
      'href',
      `/finance/school-fees?term=${TERM_2}`
    );
  });

  it('hides every tab from a teacher and from a member with no roles', async () => {
    renderFees(
      <FeesTabs term={undefined} />,
      feesApi(),
      starterAccess('teacher')
    );
    const tabs = await screen.findByRole('navigation', { name: 'Fees' });
    expect(within(tabs).queryAllByRole('link')).toEqual([]);
    expect(FEE_TABS.map((tab) => tab.gate)).toEqual([
      ['feeLine:read'],
      ['feeLine:read'],
    ]);
    expect(fakeAccess().permissions).toEqual({});
  });
});
