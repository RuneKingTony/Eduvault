import { fireEvent, screen, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import {
  billingApi,
  INVOICE_TWO_ID,
  invoiceSummary,
  renderBilling,
} from '../test-billing';
import { currentCalendar } from '../test-calendar';
import { studentList, studentRow } from '../test-students';
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
            id: INVOICE_TWO_ID,
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
            id: INVOICE_TWO_ID,
            number: null,
            status: 'draft',
            studentName: 'Tobi Adewale',
          }),
        ],
      })
    );
    const sent = within(await screen.findByRole('row', { name: /Ada Okeke/ }));
    expect(sent.getByText('CHG-2026-00001')).toBeVisible();
    expect(sent.getByText('Term fees')).toBeVisible();
    expect(sent.getByText('Sent')).toBeVisible();
    const draft = within(screen.getByRole('row', { name: /Tobi Adewale/ }));
    expect(draft.getByText('Draft')).toBeVisible();
    expect(draft.getByText('Prepared')).toBeVisible();
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

  describe('New charge', () => {
    it('describes the page with term fees, store purchases and one-off charges', async () => {
      setup();
      expect(
        await screen.findByText(
          'Everything students have been charged: term fees, store purchases and one-off charges.'
        )
      ).toBeVisible();
    });

    it('is shown to a member who can charge and puts new=1 in the address', async () => {
      const { onSearchChange } = setup(billingApi(), { q: 'ada' });
      fireEvent.click(
        await screen.findByRole('button', { name: 'New charge' })
      );
      expect(onSearchChange).toHaveBeenLastCalledWith({ q: 'ada', new: 1 });
    });

    it('is shown to the bursar', async () => {
      setup(billingApi(), {}, starterAccess('bursar'));
      expect(
        await screen.findByRole('button', { name: 'New charge' })
      ).toBeVisible();
    });

    it.each(['administrator', 'principal'])(
      'is hidden from the %s, who only read charges',
      async (slug) => {
        setup(billingApi(), {}, starterAccess(slug));
        await screen.findByText('Ada Okeke');
        expect(
          screen.queryByRole('button', { name: 'New charge' })
        ).not.toBeInTheDocument();
      }
    );

    it('does not open the sheet for a reader, even with new=1 in the address', async () => {
      setup(billingApi(), { new: 1 }, starterAccess('principal'));
      await screen.findByText('Ada Okeke');
      expect(
        screen.queryByRole('heading', { name: 'New charge' })
      ).not.toBeInTheDocument();
    });

    it('opens the sheet when the address has new=1', async () => {
      const api = {
        ...billingApi(),
        calendar: { current: vi.fn().mockResolvedValue(currentCalendar()) },
        students: {
          list: vi.fn().mockResolvedValue(studentList([studentRow()])),
          get: vi.fn().mockResolvedValue(studentRow()),
        },
      };
      setup(api, { new: 1 });
      expect(
        await screen.findByRole('heading', { name: 'New charge' })
      ).toBeVisible();
      expect(await screen.findByLabelText('Term')).toHaveValue(
        'First term, 2026/2027'
      );
    });
  });
});
