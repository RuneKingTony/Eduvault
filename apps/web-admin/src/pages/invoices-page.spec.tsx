import { fireEvent, screen, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { billingApi, invoiceSummary, renderBilling } from '../test-billing';
import { ownerAccess, starterAccess } from '../test-utils';
import { InvoicesPage } from './invoices-page';

function setup(
  api = billingApi(),
  search: Parameters<typeof InvoicesPage>[0]['search'] = {},
  access = ownerAccess()
) {
  const onSearchChange = vi.fn();
  renderBilling(
    <InvoicesPage search={search} onSearchChange={onSearchChange} />,
    api,
    { access, path: '/finance/invoices' }
  );
  return { api, onSearchChange };
}

describe('InvoicesPage', () => {
  it('shows the summary line, the kind counts and what is shown', async () => {
    setup(
      billingApi({
        invoices: [
          invoiceSummary(),
          invoiceSummary({
            id: 'inv-2',
            number: null,
            status: 'draft',
            studentName: 'Tobi Adewale',
          }),
        ],
      })
    );
    expect(
      await screen.findByText('1 charge sent · ₦452,000 · 1 waiting to be sent')
    ).toBeVisible();
    const kind = screen.getByLabelText('Kind');
    expect(
      within(kind)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'All kinds',
      'Term fees (2)',
      'One-off (0)',
      'Store purchase (2)',
    ]);
    expect(
      within(screen.getByLabelText('Status'))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Any status', 'Prepared', 'Sent', 'Cancelled']);
    expect(screen.getByText('2 shown')).toBeVisible();
  });

  it('labels a charge with no number Draft and shows the number of a sent one', async () => {
    setup(
      billingApi({
        invoices: [
          invoiceSummary(),
          invoiceSummary({
            id: 'inv-2',
            number: null,
            status: 'draft',
            studentName: 'Tobi Adewale',
          }),
        ],
      })
    );
    const sent = (await screen.findByText('Ada Okeke')).closest('tr');
    expect(
      within(sent as HTMLElement).getByText('CHG-2026-00001')
    ).toBeVisible();
    expect(within(sent as HTMLElement).getByText('Term fees')).toBeVisible();
    expect(within(sent as HTMLElement).getByText('Sent')).toBeVisible();
    const draft = screen.getByText('Tobi Adewale').closest('tr');
    expect(within(draft as HTMLElement).getByText('Draft')).toBeVisible();
    expect(within(draft as HTMLElement).getByText('Prepared')).toBeVisible();
  });

  it('opens a charge from its row', async () => {
    setup();
    expect(
      (await screen.findByRole('link', { name: /Ada Okeke/ })).getAttribute(
        'href'
      )
    ).toMatch(/\/finance\/invoices\/.+/);
  });

  it('asks the API for the filters in the address', async () => {
    const { api } = setup(billingApi(), {
      q: 'ada',
      kind: 'term',
      status: 'draft',
      page: 2,
    });
    await screen.findByText('Ada Okeke');
    expect(api.invoices.list).toHaveBeenCalledWith({
      query: { q: 'ada', kind: 'term', status: 'draft', page: 2 },
    });
  });

  it('puts a changed filter or search in the address and returns to page one', async () => {
    const { onSearchChange } = setup(billingApi(), { page: 3 });
    await screen.findByText('Ada Okeke');
    fireEvent.change(screen.getByLabelText('Kind'), {
      target: { value: 'store' },
    });
    expect(onSearchChange).toHaveBeenLastCalledWith({
      page: undefined,
      kind: 'store',
    });
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'draft' },
    });
    expect(onSearchChange).toHaveBeenLastCalledWith({
      page: undefined,
      status: 'draft',
      kind: undefined,
    });
    fireEvent.change(screen.getByLabelText('Search charges'), {
      target: { value: 'CHG-2026' },
    });
    expect(onSearchChange).toHaveBeenLastCalledWith({
      page: undefined,
      q: 'CHG-2026',
    });
  });

  it('shows the empty state when nothing matches', async () => {
    setup(billingApi({ invoices: [] }), { q: 'nobody' });
    expect(await screen.findByText('No charges match')).toBeVisible();
    expect(
      screen.getByText('Try another kind, status or search.')
    ).toBeVisible();
  });

  it('shows an error from the API', async () => {
    const api = billingApi();
    api.invoices.list.mockRejectedValue(
      new ApiError(500, { code: 'InternalError', message: 'Try again later.' })
    );
    setup(api);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Try again later.'
    );
  });

  it('lists the fee tabs for a reader, with Charges present', async () => {
    setup(billingApi(), {}, starterAccess('administrator'));
    const tabs = await screen.findByRole('navigation', { name: 'Fees' });
    expect(within(tabs).getByRole('link', { name: 'Charges' })).toBeVisible();
  });
});
