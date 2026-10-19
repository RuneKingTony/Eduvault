import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import {
  INVOICE_ID,
  billingApi,
  invoice,
  renderBilling,
} from '../test-billing';
import { SALE_ID } from '../test-store';
import { fakeAccess } from '../test-utils';
import { InvoicePage } from './invoice-page';

function setup(api = billingApi(), access?: ReturnType<typeof fakeAccess>) {
  const onBack = vi.fn();
  renderBilling(<InvoicePage invoiceId={INVOICE_ID} onBack={onBack} />, api, {
    path: `/finance/invoices/${INVOICE_ID}`,
    ...(access === undefined ? {} : { access }),
  });
  return { api, onBack };
}

const definitions = () => {
  const terms = screen.getAllByRole('term');
  const values = screen.getAllByRole('definition');
  expect(values).toHaveLength(terms.length);
  return new Map(
    terms.map((term, index) => [term.textContent, values[index]?.textContent])
  );
};

const storeCharge = () =>
  invoice({
    kind: 'store',
    billingRun: null,
    source: { kind: 'store_sale', id: SALE_ID, number: 'ISS-2026-0001' },
  });

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('InvoicePage', () => {
  it('shows a sent charge: header, lines with the discount muted, and the total', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: /CHG-2026-00001/ })
    ).toBeVisible();
    expect(screen.getByText(/^Term fees ·/)).toHaveTextContent(
      'Term fees · Ada Okeke · JSS 2 Gold'
    );
    const discount = screen.getByRole('row', { name: /Sibling discount/ });
    expect(discount).toHaveClass('bg-muted/40');
    expect(
      within(discount).getByText(
        'Sibling discount (3 children) (5% of tuition)'
      )
    ).toBeVisible();
    expect(within(discount).getByText('−₦9,000')).toBeVisible();
    expect(screen.getByRole('row', { name: /^Total/ })).toHaveTextContent(
      '₦171,000'
    );
  });

  it('links the student name and the Student statement action to the same statement', async () => {
    const sent = invoice();
    setup(billingApi({ invoice: sent }));
    const href = `/finance/accounts/${sent.student.id}`;
    expect(
      await screen.findByRole('link', { name: 'Ada Okeke' })
    ).toHaveAttribute('href', href);
    expect(
      screen.getByRole('link', { name: 'Student statement' })
    ).toHaveAttribute('href', href);
  });

  it('shows what was owed before, what is due and the balance today', async () => {
    setup();
    await screen.findByText('Due at issue');
    expect(screen.getByText('₦183,000')).toBeVisible();
    const shown = definitions();
    expect(shown.get('This charge')).toBe('₦171,000');
    expect(shown.get('Brought forward')).toBe('₦12,000');
    expect(shown.get('Balance today')).toBe('₦58,000');
  });

  it('shows the details: number, term, round link, issued and who is charged', async () => {
    setup();
    await screen.findByText('Details');
    const shown = definitions();
    expect(shown.get('Number')).toBe('CHG-2026-00001');
    expect(shown.get('Term')).toBe('First term, 2026/2027');
    expect(shown.get('Sent with')).toBe('BR-2026-0001');
    expect(screen.getByRole('link', { name: 'BR-2026-0001' })).toBeVisible();
    expect(shown.get('Issued')).toMatch(/ by Chika Eze$/);
    expect(shown.get('Charged to')).toBe('Ngozi Okeke (mother)');
  });

  it('links a store charge to its sale in the Items sold tab', async () => {
    setup(billingApi({ invoice: storeCharge() }));
    await screen.findByText('Details');

    expect(definitions().get('Source')).toBe('ISS-2026-0001');
    const link = screen.getByRole('link', { name: 'ISS-2026-0001' });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(`/finance/store?tab=sold&sale=${SALE_ID}`)
    );
  });

  it('names the sale without a link for someone who cannot open the store', async () => {
    setup(
      billingApi({ invoice: storeCharge() }),
      fakeAccess({
        roles: ['custom'],
        permissions: toPermissionMap(['invoice:read']),
        campusScope: 'all',
      })
    );

    expect(await screen.findByText('ISS-2026-0001')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'ISS-2026-0001' })
    ).not.toBeInTheDocument();
  });

  it('shows no Source for a term charge', async () => {
    setup();
    await screen.findByText('Details');
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
  });

  it('opens the accountant’s card to a balanced journal', async () => {
    setup();
    const trigger = await screen.findByRole('button', {
      name: /For your accountant: CHG-2026-00001/,
    });
    await user.click(trigger);
    expect(await screen.findByText('Balanced')).toBeVisible();
    expect(screen.getByText('1100 Fees owed to the school')).toBeVisible();
    expect(screen.getByText('4010 Tuition')).toBeVisible();
  });

  it('flags a journal that is out of balance', async () => {
    const sent = invoice();
    setup(
      billingApi({
        invoice: invoice({
          journal: sent.journal && { ...sent.journal, balanced: false },
        }),
      })
    );
    await user.click(
      await screen.findByRole('button', { name: /For your accountant/ })
    );
    expect(await screen.findByText('Out of balance')).toBeVisible();
  });

  it('shows a prepared charge with no number, no journal and the callout', async () => {
    setup(
      billingApi({
        invoice: invoice({
          number: null,
          status: 'draft',
          issuedAt: null,
          issuedBy: null,
          journal: null,
        }),
      })
    );
    expect(
      await screen.findByRole('heading', { name: /Prepared charge/ })
    ).toBeVisible();
    expect(screen.getByText('Given when sent')).toBeVisible();
    expect(
      screen.getByText(
        'Nothing is recorded in the books until these charges are sent.'
      )
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /For your accountant/ })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows the not found state for a charge out of scope', async () => {
    const api = billingApi();
    api.invoices.get.mockRejectedValue(
      new ApiError(404, { code: 'NotFound', message: 'Charge not found' })
    );
    const { onBack } = setup(api);
    expect(await screen.findByText('No charge here')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back to charges' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });
});
