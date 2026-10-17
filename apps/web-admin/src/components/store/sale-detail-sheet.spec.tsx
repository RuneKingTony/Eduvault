import { fireEvent, screen } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { ADA_ID, PROOF_ID, SALE_ID, sale } from '../../test-store';
import { renderPayments } from '../../test-payments';
import { fakeAccess, ownerAccess } from '../../test-utils';
import { SaleDetailSheet } from './sale-detail-sheet';

const accessWith = (permissions: Parameters<typeof toPermissionMap>[0]) =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
  });

function setup(
  options: {
    access?: ReturnType<typeof ownerAccess>;
    load?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const api = {
    store: {
      sale: options.load ?? vi.fn().mockResolvedValue(sale()),
    },
  };
  const onClose = vi.fn();
  const onStatement = vi.fn();
  renderPayments(
    <SaleDetailSheet
      saleId={SALE_ID}
      onClose={onClose}
      onStatement={onStatement}
    />,
    api,
    { access: options.access ?? ownerAccess() }
  );
  return { api, onClose, onStatement };
}

describe('SaleDetailSheet', () => {
  it('shows the sale read-only: facts, lines with a total, the receipt and the proof', async () => {
    const { api } = setup();

    expect(
      await screen.findByRole('heading', { name: 'ISS-2026-0001' })
    ).toBeVisible();
    expect(api.store.sale).toHaveBeenCalledWith({ params: { id: SALE_ID } });
    expect(screen.getByText('Ada Okeke · JSS 1 Gold')).toBeVisible();
    expect(screen.getByText('Lekki')).toBeVisible();
    expect(screen.getByText('Chika Eze')).toBeVisible();
    expect(screen.getByText('School shirt, Size 12')).toBeVisible();
    expect(screen.getByText('₦13,000')).toBeVisible();
    expect(screen.getByRole('link', { name: 'RCT-2026-00012' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'pos-slip.pdf' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/files/${PROOF_ID}`)
    );
  });

  it('opens the statement for someone who can read finance', async () => {
    const { onStatement } = setup();

    fireEvent.click(await screen.findByRole('button', { name: 'Statement' }));

    expect(onStatement).toHaveBeenCalledWith(ADA_ID);
  });

  it('keeps the statement, the receipt link and the proof link behind finance permissions', async () => {
    setup({ access: accessWith(['store:read']) });

    expect(
      await screen.findByRole('heading', { name: 'ISS-2026-0001' })
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Statement' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'RCT-2026-00012' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('RCT-2026-00012')).toBeVisible();
    expect(screen.getByText('Receipt uploaded: pos-slip.pdf')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'pos-slip.pdf' })
    ).not.toBeInTheDocument();
  });

  it('links the receipt and the proof for payment:read without the statement', async () => {
    setup({ access: accessWith(['store:read', 'payment:read']) });

    expect(
      await screen.findByRole('link', { name: 'RCT-2026-00012' })
    ).toHaveAttribute('href', expect.stringContaining('/finance/payments/'));
    expect(screen.getByRole('link', { name: 'pos-slip.pdf' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Statement' })).toBeVisible();
  });

  it('shows the refusal for a sale that is not in view', async () => {
    setup({
      load: vi
        .fn()
        .mockRejectedValue(
          new ApiError(404, { code: 'NotFound', message: 'Sale not found' })
        ),
    });

    expect(await screen.findByText('Sale not found')).toBeVisible();
  });

  it('closes from the Close button', async () => {
    const { onClose } = setup();

    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });
});
