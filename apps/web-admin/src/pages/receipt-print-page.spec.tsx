import { screen, within } from '@testing-library/react';
import { profile, settings } from '../test-school';
import { PAYMENT_ID, payment, renderPayments } from '../test-payments';
import { ReceiptPrintPage } from './receipt-print-page';

function setup(
  over: Partial<ReturnType<typeof settings>> = {},
  receipt = payment()
) {
  const print = vi.fn();
  vi.stubGlobal('print', print);
  const api = {
    payments: { get: vi.fn().mockResolvedValue(receipt) },
    schoolAccount: {
      get: vi
        .fn()
        .mockResolvedValue(
          profile({ logoUrl: '/files/logo-1', logoFileId: 'logo-1' })
        ),
    },
    schoolSettings: {
      get: vi
        .fn()
        .mockResolvedValue(
          settings({ receiptFooter: 'Thank God for your payment.', ...over })
        ),
    },
  };
  renderPayments(<ReceiptPrintPage paymentId={PAYMENT_ID} />, api, {
    path: `/finance/payments/${PAYMENT_ID}/print`,
  });
  return { print, api };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReceiptPrintPage', () => {
  it('opens the print dialog once the receipt has loaded', async () => {
    const { print } = setup();
    await screen.findAllByText('Receipt RCT-2026-00088');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('prints the school’s logo, name and contact details at the top', async () => {
    setup();
    const slip = await waitForSlip();
    expect(within(slip).getByText('Greenfield College')).toBeVisible();
    expect(
      within(slip).getByAltText('Greenfield College logo')
    ).toHaveAttribute('src', expect.stringContaining('/files/logo-1'));
    expect(
      within(slip).getByText('1 Palm Road · Lagos · 08012345678')
    ).toBeInTheDocument();
  });

  it('prints the facts, each allocation, the total, the recorder and the footer', async () => {
    setup();
    const slip = await waitForSlip();
    for (const text of [
      'Receipt RCT-2026-00088',
      '7 Oct 2026',
      'Ngozi Okeke',
      'Bank transfer',
      'TRF-20261007-K3Q7ZA',
      'GTB/FT/2610070031',
      'Ada Okeke',
      'Chidi Okeke',
      '₦180,000',
      '₦60,000',
      '₦240,000',
      'Recorded by Chika Eze',
      'Thank God for your payment.',
    ]) {
      expect(within(slip).getByText(text)).toBeInTheDocument();
    }
  });

  it('marks a cancelled receipt on the print sheet and leaves a recorded one unmarked', async () => {
    setup({}, payment({ status: 'voided' }));
    const slip = await waitForSlip();
    expect(within(slip).getByText('Cancelled')).toBeVisible();
  });

  it('prints no Cancelled mark on a recorded receipt', async () => {
    setup();
    const slip = await waitForSlip();
    expect(within(slip).queryByText('Cancelled')).toBeNull();
  });
});

async function waitForSlip(): Promise<HTMLElement> {
  await screen.findAllByText('Receipt RCT-2026-00088');
  const slip = document.querySelector('[data-print-slips]');
  if (slip === null) {
    throw new Error('No print sheet');
  }
  return slip as HTMLElement;
}
