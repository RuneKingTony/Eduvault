import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  portalMovement,
  portalMovements,
  renderWithApi,
  testId,
} from '../../test-utils';
import { WalletHistoryCard } from './wallet-history-card';

const online = portalMovement({
  id: testId(0x2_00_12),
  kind: 'wallet_topup',
  reference: 'MNFY|20|20261024120000|000001',
  amountMinor: 4_950_000,
  source: {
    type: 'monnify',
    transactionReference: 'MNFY|20|20261024120000|000001',
    paymentReference: 'pay-1',
    signatureVerified: true,
    paidAt: '2026-10-24T11:15:29.000Z',
    confirmedAt: '2026-10-24T11:15:31.000Z',
    grossMinor: 5_000_000,
    feeMinor: 50_000,
    netMinor: 4_950_000,
  },
});
const spend = portalMovement({
  id: testId(0x2_00_13),
  kind: 'wallet_spend',
  reference: 'WSP-20261008-ABCDEF',
  studentName: 'Ada Okeke',
  amountMinor: -1_000_000,
  source: { type: 'spend' },
});

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
});

describe('WalletHistoryCard', () => {
  it('lists each movement with a plain title, its reference and a signed amount', async () => {
    renderWithApi(<WalletHistoryCard />, {
      portalWallet: {
        movements: vi
          .fn()
          .mockResolvedValue(
            portalMovements([online, spend, portalMovement()])
          ),
      },
    });
    await screen.findByText('Online top-up · Monnify');
    const history = screen.getByRole('group', { name: 'History' });
    expect(
      within(history).getByText('Online top-up · Monnify')
    ).toBeInTheDocument();
    expect(
      within(history).getByText('Paid Ada Okeke’s charges')
    ).toBeInTheDocument();
    expect(
      within(history).getByText('Top-up from Uncle Bode · Cash')
    ).toBeInTheDocument();
    expect(within(history).getByText('−₦10,000.00')).toBeInTheDocument();
    expect(within(history).getByText('₦49,500.00')).toBeInTheDocument();
  });

  it('offers Trace on an online top-up only, and opens the Monnify facts', async () => {
    renderWithApi(<WalletHistoryCard />, {
      portalWallet: {
        movements: vi.fn().mockResolvedValue(portalMovements([online, spend])),
      },
    });
    await screen.findByText('Online top-up · Monnify');
    expect(screen.getAllByRole('button', { name: 'Trace' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Trace' }));

    const dialog = await screen.findByRole('dialog', { name: 'Trace' });
    expect(within(dialog).getByText('Valid')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Credited to the wallet')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('₦500.00')).toBeInTheDocument();
    expect(within(dialog).getByText('₦49,500.00')).toBeInTheDocument();
  });

  it('says so when there is no history', async () => {
    renderWithApi(<WalletHistoryCard />, {
      portalWallet: {
        movements: vi.fn().mockResolvedValue(portalMovements([])),
      },
    });
    expect(
      await screen.findByText('No wallet history yet')
    ).toBeInTheDocument();
  });

  it('pages through the history ten at a time', async () => {
    const movements = vi
      .fn()
      .mockResolvedValue(portalMovements([online], { total: 25 }));
    renderWithApi(<WalletHistoryCard />, { portalWallet: { movements } });
    await screen.findByText('Showing 1 to 10 of 25');
    expect(movements).toHaveBeenCalledWith({
      query: { page: 1, pageSize: 10 },
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByRole('group', { name: 'History' });
    expect(movements).toHaveBeenCalledWith({
      query: { page: 2, pageSize: 10 },
    });
  });

  it('shows the error when the history cannot be loaded', async () => {
    renderWithApi(<WalletHistoryCard />, {
      portalWallet: {
        movements: vi.fn().mockRejectedValue(new Error('The school is away')),
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The school is away'
    );
  });
});
