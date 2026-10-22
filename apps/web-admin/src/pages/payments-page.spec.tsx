import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { starterAccess } from '../test-utils';
import {
  paymentList,
  paymentSummary,
  recordingOptions,
  renderPayments,
} from '../test-payments';
import { PaymentsPage } from './payments-page';

function setup(
  options: {
    list?: ReturnType<typeof paymentList>;
    search?: Parameters<typeof PaymentsPage>[0]['search'];
    access?: ReturnType<typeof starterAccess>;
  } = {}
) {
  const api = {
    payments: {
      list: vi.fn().mockResolvedValue(options.list ?? paymentList()),
      recordingOptions: vi.fn().mockResolvedValue(recordingOptions()),
    },
  };
  const onSearchChange = vi.fn();
  renderPayments(
    <PaymentsPage
      search={options.search ?? {}}
      onSearchChange={onSearchChange}
    />,
    api,
    { access: options.access }
  );
  return { api, onSearchChange };
}

async function amountCell() {
  const headers = await screen.findAllByRole('columnheader');
  const column = headers.findIndex((header) => header.textContent === 'Amount');
  const row = await screen.findByRole('row', { name: /RCT-2026-00088/ });
  return within(row).getAllByRole('cell')[column];
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('PaymentsPage', () => {
  it('shows the summary line and the receipt count', async () => {
    setup({
      list: paymentList([paymentSummary()], {
        summary: {
          receiptCount: 3,
          receivedMinor: 51_000_000,
          cancellationsWaiting: 2,
        },
        total: 3,
      }),
    });

    expect(
      await screen.findByText(
        '3 receipts · ₦510,000 received · 2 cancellations waiting for approval'
      )
    ).toBeVisible();
    expect(screen.getByText('3 receipts')).toBeVisible();
  });

  it('leaves the cancellation words out when none is waiting', async () => {
    setup();
    expect(
      await screen.findByText('1 receipt · ₦240,000 received')
    ).toBeVisible();
  });

  it('lists the receipt number, date and method, payer, students, account, amount and status', async () => {
    setup();

    const row = await screen.findByRole('row', { name: /RCT-2026-00088/ });
    const cells = within(row);
    expect(cells.getByText('7 Oct 2026 · Bank transfer')).toBeVisible();
    expect(cells.getByText('Ngozi Okeke')).toBeVisible();
    expect(cells.getByText('GTBank current · ending 4417')).toBeVisible();
    expect(cells.getByText('₦240,000')).toBeVisible();
    expect(cells.getByText('Recorded')).toBeVisible();
    expect(cells.getByRole('link', { name: /RCT-2026-00088/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/finance\/payments\/.+/)
    );
  });

  it('strikes through a cancelled payment’s amount', async () => {
    setup({
      list: paymentList([paymentSummary({ status: 'voided' })]),
    });
    expect(await amountCell()).toHaveClass('line-through');
    expect(screen.getByText('Cancelled')).toBeVisible();
  });

  it('labels a receipt with a cancellation waiting and keeps its amount unstruck', async () => {
    setup({
      list: paymentList([paymentSummary({ status: 'void_pending' })]),
    });
    expect(await screen.findByText('Cancellation waiting')).toBeVisible();
    expect(await amountCell()).not.toHaveClass('line-through');
  });

  it('shows Record payment to a bursar', async () => {
    setup({ access: starterAccess('bursar') });
    expect(
      await screen.findByRole('button', { name: 'Record payment' })
    ).toBeVisible();
  });

  it('opens the sheet for a bursar from the address', async () => {
    setup({ access: starterAccess('bursar'), search: { record: 1 } });
    expect(
      await screen.findByRole('heading', { name: 'Record a payment' })
    ).toBeVisible();
  });

  it('gives a reader with ?record=1 no sheet', async () => {
    setup({ access: starterAccess('administrator'), search: { record: 1 } });
    await screen.findByText('RCT-2026-00088');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Record a payment' })
    ).toBeNull();
  });

  it('asks the page to open the sheet from the header button', async () => {
    const { onSearchChange } = setup({ access: starterAccess('bursar') });
    await user.click(
      await screen.findByRole('button', { name: 'Record payment' })
    );
    expect(onSearchChange).toHaveBeenCalledWith({ record: 1 });
  });

  it('hides Record payment from a reader', async () => {
    setup({ access: starterAccess('administrator') });
    await screen.findByText('RCT-2026-00088');
    expect(
      screen.queryByRole('button', { name: 'Record payment' })
    ).not.toBeInTheDocument();
  });

  it('says there are no payments yet, with Record payment as the action', async () => {
    setup({ list: paymentList([]) });
    expect(await screen.findByText('No payments yet')).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Record payment' })
    ).toHaveLength(2);
  });

  it('says no receipts match a search, without an action', async () => {
    setup({ list: paymentList([]), search: { q: 'zzz' } });
    expect(await screen.findByText('No receipts match')).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Record payment' })
    ).toHaveLength(1);
  });

  it('searches as you type and returns to the first page', async () => {
    const { onSearchChange } = setup({ search: { page: 2 } });
    await user.click(await screen.findByLabelText('Search payments'));
    await user.paste('ngozi');
    expect(onSearchChange).toHaveBeenCalledWith({
      q: 'ngozi',
      page: undefined,
    });
  });
});
