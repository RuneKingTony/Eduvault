import { screen, within } from '@testing-library/react';
import { profile, settings } from '../test-school';
import { PAYMENT_ID, payment, renderPayments } from '../test-payments';
import { ReceiptPrintPage } from './receipt-print-page';

const LOGO_ID = '00000000-0000-4000-8000-0000000a0b01';

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
          profile({ logoUrl: `/files/${LOGO_ID}`, logoFileId: LOGO_ID })
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
    for (const sheet of await waitForSheets()) {
      expect(within(sheet).getByText('Greenfield College')).toBeVisible();
      expect(
        within(sheet).getByAltText('Greenfield College logo')
      ).toHaveAttribute('src', expect.stringContaining(`/files/${LOGO_ID}`));
      expect(
        within(sheet).getByText('1 Palm Road · Lagos · 08012345678')
      ).toBeInTheDocument();
    }
  });

  it('prints the facts, each allocation, the total, the recorder and the footer', async () => {
    setup();
    const sheets = await waitForSheets();
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
      for (const sheet of sheets) {
        expect(within(sheet).getByText(text)).toBeInTheDocument();
      }
    }
  });

  it('marks a cancelled receipt on the print sheet', async () => {
    setup({}, payment({ status: 'voided' }));
    for (const sheet of await waitForSheets()) {
      expect(within(sheet).getByText('Cancelled')).toBeVisible();
    }
  });

  it('prints no Cancelled mark on a recorded receipt', async () => {
    setup();
    for (const sheet of await waitForSheets()) {
      expect(within(sheet).queryByText('Cancelled')).toBeNull();
    }
  });
});

async function waitForSheets(): Promise<HTMLElement[]> {
  const sheets = await screen.findAllByRole('article');
  expect(sheets).toHaveLength(2);
  return sheets;
}
