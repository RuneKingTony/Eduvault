import { screen, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { PAYMENT_ID, payment, renderPayments } from '../test-payments';
import { ReceiptPage } from './receipt-page';

function setup(
  options: {
    payment?: ReturnType<typeof payment>;
    failWith?: Error;
    recorded?: boolean;
  } = {}
) {
  const api = {
    payments: {
      get: vi
        .fn()
        .mockImplementation(() =>
          options.failWith === undefined
            ? Promise.resolve(options.payment ?? payment())
            : Promise.reject(options.failWith)
        ),
    },
  };
  renderPayments(
    <ReceiptPage paymentId={PAYMENT_ID} recorded={options.recorded} />,
    api,
    { path: `/finance/payments/${PAYMENT_ID}` }
  );
  return api;
}

describe('ReceiptPage', () => {
  it('titles the receipt with its status, amount, payer and date', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: /Receipt RCT-2026-00088/ })
    ).toBeVisible();
    expect(screen.getByText('Recorded')).toBeVisible();
    expect(
      screen.getByText('₦240,000 from Ngozi Okeke on 7 Oct 2026')
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Print receipt' })).toBeVisible();
  });

  it('shows the success callout only right after recording', async () => {
    setup({ recorded: true });
    expect(
      await screen.findByText(
        'Payment recorded. Entering it again by mistake will not record it twice.'
      )
    ).toBeVisible();
  });

  it('has no callout when the receipt is opened later', async () => {
    setup();
    await screen.findByRole('heading', { name: /Receipt RCT-2026-00088/ });
    expect(screen.queryByText(/Payment recorded/)).not.toBeInTheDocument();
  });

  it('lists each student’s share with their balance now, and the total', async () => {
    setup();
    const ada = (
      await screen.findByRole('link', { name: 'Ada Okeke' })
    ).closest('tr');
    expect(within(ada as HTMLElement).getByText('JSS 1 Gold')).toBeVisible();
    expect(within(ada as HTMLElement).getByText('₦180,000')).toBeVisible();
    expect(within(ada as HTMLElement).getByText('Paid up')).toBeVisible();
    expect(ada?.querySelector('a')?.getAttribute('href')).toMatch(
      /\/finance\/accounts\/.+/
    );
    expect(screen.getAllByText('₦240,000').length).toBeGreaterThan(0);
  });

  it('names a student out of scope with no balance and no link', async () => {
    setup();
    const chidi = (await screen.findByText('Chidi Okeke')).closest('tr');
    expect(within(chidi as HTMLElement).queryByRole('link')).toBeNull();
    expect(within(chidi as HTMLElement).getByText('₦60,000')).toBeVisible();
    expect(within(chidi as HTMLElement).queryByText('Paid up')).toBeNull();
  });

  it('shows an owing student in red and a student in credit as extra paid', async () => {
    setup({
      payment: payment({
        allocations: [
          {
            studentId: '00000000-0000-4000-8000-0000000d0001',
            studentName: 'Ada Okeke',
            className: 'JSS 1',
            amountMinor: 100,
            inScope: true,
            balanceMinor: 6_000_000,
          },
          {
            studentId: '00000000-0000-4000-8000-0000000d0002',
            studentName: 'Chidi Okeke',
            className: 'JSS 2',
            amountMinor: 100,
            inScope: true,
            balanceMinor: -500_000,
          },
        ],
      }),
    });
    expect(await screen.findByText('₦60,000')).toBeVisible();
    expect(screen.getByText('₦5,000 extra paid')).toBeVisible();
  });

  it('keeps the accountant’s entry in a collapsed card', async () => {
    setup();
    expect(
      await screen.findByText('For your accountant: TRF-20261007-K3Q7ZA')
    ).toBeVisible();
  });

  it('shows the receipt card with the reference, provider ref, method, account, recorder and proof link', async () => {
    setup();
    await screen.findByText('Receipt no.');
    expect(screen.getByText('GTB/FT/2610070031')).toBeVisible();
    expect(screen.getByText('Bank transfer')).toBeVisible();
    expect(screen.getByText('Chika Eze')).toBeVisible();
    expect(screen.getByRole('link', { name: /alert\.pdf/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/files\/00000000-0000-4000-8000-0000000a0a01$/)
    );
  });

  it('shows a dash for a missing provider reference and says when a transfer has no proof', async () => {
    setup({ payment: payment({ providerReference: null, proof: null }) });
    await screen.findByText('Provider ref.');
    expect(screen.getByText('—')).toBeVisible();
    expect(
      screen.getByText('Not uploaded (recorded before uploads were required)')
    ).toBeVisible();
  });

  it('says No receipt here for a receipt that is out of reach', async () => {
    setup({
      failWith: new ApiError(404, {
        code: 'NotFound',
        message: 'Receipt not found',
      }),
    });
    expect(await screen.findByText('No receipt here')).toBeVisible();
    expect(
      screen.getByText(
        'It may have been moved, or it may belong to a campus you don’t look after.'
      )
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to payments' })
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });
});
