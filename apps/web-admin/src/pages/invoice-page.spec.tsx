import { fireEvent, screen, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import {
  INVOICE_ID,
  billingApi,
  invoice,
  renderBilling,
} from '../test-billing';
import { InvoicePage } from './invoice-page';

function setup(api = billingApi()) {
  const onBack = vi.fn();
  renderBilling(<InvoicePage invoiceId={INVOICE_ID} onBack={onBack} />, api, {
    path: `/finance/invoices/${INVOICE_ID}`,
  });
  return { api, onBack };
}

describe('InvoicePage', () => {
  it('shows a sent charge: header, lines with the discount muted, and the total', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: /CHG-2026-00001/ })
    ).toBeVisible();
    expect(
      screen.getByText('Term fees · Ada Okeke · JSS 2 Gold')
    ).toBeVisible();
    const discount = screen
      .getByText('Sibling discount (3 children) (5% of tuition)')
      .closest('tr');
    expect(discount).toHaveClass('bg-muted/40');
    expect(within(discount as HTMLElement).getByText('−₦9,000')).toBeVisible();
    expect(screen.getByText('Total').closest('tr')).toHaveTextContent(
      '₦171,000'
    );
  });

  it('shows what was owed before, what is due and the balance today', async () => {
    setup();
    await screen.findByText('Due at issue');
    expect(screen.getByText('₦183,000')).toBeVisible();
    const rows = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).parentElement;
    expect(rows('This charge')).toHaveTextContent('₦171,000');
    expect(rows('Brought forward')).toHaveTextContent('₦12,000');
    expect(rows('Balance today')).toHaveTextContent('₦58,000');
  });

  it('shows the details: number, term, round link, issued and who is charged', async () => {
    setup();
    const card = (await screen.findByText('Details')).closest(
      '[data-slot="card"]'
    );
    const cardView = within(card as HTMLElement);
    expect(cardView.getByText('CHG-2026-00001')).toBeVisible();
    expect(cardView.getByText('First term, 2026/2027')).toBeVisible();
    expect(cardView.getByRole('link', { name: 'BR-2026-0001' })).toBeVisible();
    expect(cardView.getByText(/ by Chika Eze/)).toBeVisible();
    expect(cardView.getByText('Ngozi Okeke (mother)')).toBeVisible();
  });

  it('opens the accountant’s card to a balanced journal', async () => {
    setup();
    const trigger = await screen.findByRole('button', {
      name: /For your accountant: CHG-2026-00001/,
    });
    fireEvent.click(trigger);
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
    fireEvent.click(
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

  it('has no Student statement action until the statement exists', async () => {
    setup();
    await screen.findByText('Due at issue');
    expect(
      screen.queryByRole('link', { name: /Student statement/ })
    ).not.toBeInTheDocument();
  });

  it('shows the not found state for a charge out of scope', async () => {
    const api = billingApi();
    api.invoices.get.mockRejectedValue(
      new ApiError(404, { code: 'NotFound', message: 'Charge not found' })
    );
    const { onBack } = setup(api);
    expect(await screen.findByText('No charge here')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to charges' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });
});
