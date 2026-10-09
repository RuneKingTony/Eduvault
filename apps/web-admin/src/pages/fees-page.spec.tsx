import { screen } from '@testing-library/react';
import type { FeeSchedule } from '@eduvault/api-contract';
import { renderWithApi, starterAccess } from '../test-utils';
import { FeesPage } from './fees-page';

const fee = (overrides: Partial<FeeSchedule> = {}): FeeSchedule => ({
  id: '3e0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c44',
  organizationId: '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
  campusId: null,
  name: 'Tuition',
  amountMinor: 1_250_000,
  currency: 'NGN',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderFees = (fees: FeeSchedule[]) =>
  renderWithApi(<FeesPage />, {
    feeSchedules: { list: vi.fn().mockResolvedValue(fees) },
  });

describe('FeesPage', () => {
  it('shows an NGN fee with the naira sign', async () => {
    renderFees([fee()]);
    expect(await screen.findByText('₦12,500')).toBeInTheDocument();
  });

  it('shows the currency code for a fee that is not in naira', async () => {
    renderFees([fee({ amountMinor: 1_250_050, currency: 'USD' })]);
    expect(await screen.findByText('USD 12,500.50')).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
  });

  it('renders a placeholder instead of crashing on a fractional amount', async () => {
    renderFees([
      fee({ name: 'Broken', amountMinor: 12.5 }),
      fee({ id: '3e0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c45', name: 'Tuition' }),
    ]);
    expect(await screen.findByText('Broken')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('₦12,500')).toBeInTheDocument();
  });

  it('lists the schedules for a member holding only feeSchedule:read', async () => {
    const reader = {
      ...starterAccess('teacher'),
      permissions: { feeSchedule: ['read' as const] },
    };
    renderWithApi(
      <FeesPage />,
      { feeSchedules: { list: vi.fn().mockResolvedValue([fee()]) } },
      reader
    );
    expect(await screen.findByText('₦12,500')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
