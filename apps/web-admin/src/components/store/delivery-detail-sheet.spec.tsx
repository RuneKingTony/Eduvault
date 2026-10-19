import { fireEvent, screen } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { IKEJA, LEKKI } from '../../test-members';
import {
  DELIVERY_ID,
  deliveryDetail,
  deliveryLine,
  openingDeliveryDetail,
} from '../../test-store';
import { renderWithApi } from '../../test-utils';
import { DeliveryDetailSheet } from './delivery-detail-sheet';

function setup(
  options: {
    delivery?: ReturnType<typeof deliveryDetail>;
    load?: ReturnType<typeof vi.fn>;
    showCosts?: boolean;
    campusesFail?: boolean;
  } = {}
) {
  const api = {
    campuses: {
      list:
        options.campusesFail === true
          ? vi.fn().mockRejectedValue(new Error('campuses down'))
          : vi.fn().mockResolvedValue([LEKKI, IKEJA]),
    },
    store: {
      delivery:
        options.load ??
        vi.fn().mockResolvedValue(options.delivery ?? deliveryDetail()),
    },
  };
  const onClose = vi.fn();
  const onItem = vi.fn();
  renderWithApi(
    <DeliveryDetailSheet
      deliveryId={DELIVERY_ID}
      showCosts={options.showCosts ?? false}
      onClose={onClose}
      onItem={onItem}
    />,
    api
  );
  return { api, onClose, onItem };
}

const factOf = (label: string) => {
  const index = screen
    .getAllByRole('term')
    .findIndex((term) => term.textContent === label);
  return screen.getAllByRole('definition')[index];
};

describe('DeliveryDetailSheet', () => {
  it('shows the delivery read-only: facts, lines and the total', async () => {
    const { api } = setup({ showCosts: true });

    expect(
      await screen.findByRole('heading', { name: 'DEL-2026-0001' })
    ).toBeVisible();
    expect(api.store.delivery).toHaveBeenCalledWith({
      params: { id: DELIVERY_ID },
    });
    expect(screen.getByText('Stock received at the store.')).toBeVisible();
    expect(screen.getByText('Adebayo Uniforms Ltd')).toBeVisible();
    expect(await screen.findByText('Lekki')).toBeVisible();
    expect(screen.getByText('Chika Eze')).toBeVisible();
    expect(screen.getByText('GTBank current')).toBeVisible();
    expect(screen.getByText('DEL-REQ-20260901-AB12CD34')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'School shirt, Size 12' })
    ).toBeVisible();
    expect(screen.getByText('10')).toBeVisible();
    expect(screen.getByText('₦3,500')).toBeVisible();
    expect(screen.getAllByText('₦35,000')).toHaveLength(2);
    expect(screen.queryByText('Retired')).not.toBeInTheDocument();
  });

  it('masks every cost while Show costs is off', async () => {
    setup();

    await screen.findByRole('heading', { name: 'DEL-2026-0001' });

    expect(screen.getAllByRole('img', { name: 'Hidden' })).toHaveLength(3);
    expect(screen.queryByText('₦35,000')).not.toBeInTheDocument();
  });

  it('marks the held-at-go-live delivery and the missing receiver', async () => {
    setup({
      delivery: { ...openingDeliveryDetail(), receivedBy: null },
    });

    expect(await screen.findByText('Stock held at go-live.')).toBeVisible();
    expect(screen.getByText('Stock held at go-live')).toBeVisible();
    expect(factOf('Received by')).toHaveTextContent('—');
  });

  it('still shows the delivery when the campuses fail to load', async () => {
    setup({ campusesFail: true });

    expect(await screen.findByText('Adebayo Uniforms Ltd')).toBeVisible();
    expect(factOf('Campus')).toHaveTextContent('—');
  });

  it('badges a retired item', async () => {
    setup({
      delivery: deliveryDetail({ lines: [deliveryLine({ retired: true })] }),
    });

    expect(await screen.findByText('Retired')).toBeVisible();
  });

  it('hands the line to onItem with the delivery campus', async () => {
    const { onItem } = setup();

    fireEvent.click(
      await screen.findByRole('button', { name: 'School shirt, Size 12' })
    );

    expect(onItem).toHaveBeenCalledWith({
      itemName: deliveryLine().itemName,
      retired: false,
      campusId: LEKKI.id,
    });
  });

  it('offers Close and nothing that changes the delivery', async () => {
    const { onClose } = setup();
    await screen.findByRole('heading', { name: 'DEL-2026-0001' });

    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual(['School shirt, Size 12', 'Close', 'Close']);

    fireEvent.click(screen.getByText('Close', { selector: 'button' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('shows the refusal for a delivery that is not in view', async () => {
    setup({
      load: vi
        .fn()
        .mockRejectedValue(
          new ApiError(404, { code: 'NotFound', message: 'Delivery not found' })
        ),
    });

    expect(await screen.findByText('Delivery not found')).toBeVisible();
  });
});
