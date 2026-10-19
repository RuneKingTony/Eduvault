import { fireEvent, screen, within } from '@testing-library/react';
import { IKEJA, LEKKI } from '../../test-members';
import { OPENING_ID, deliveryList, openingDelivery } from '../../test-store';
import { renderWithApi } from '../../test-utils';
import { DeliveriesTable } from './deliveries-table';

function setup() {
  const onOpen = vi.fn();
  renderWithApi(
    <DeliveriesTable
      data={deliveryList([openingDelivery()])}
      campuses={[LEKKI, IKEJA]}
      showCampus
      showCosts={false}
      page={1}
      onPage={vi.fn()}
      onOpen={onOpen}
    />,
    {}
  );
  return { onOpen };
}

describe('DeliveriesTable', () => {
  it('opens the delivery from the number and the other text cells', () => {
    const { onOpen } = setup();
    const row = within(
      screen.getByRole('row', { name: new RegExp(`OPEN-STORE-${LEKKI.id}`) })
    );

    fireEvent.click(
      screen.getByRole('button', { name: `OPEN-STORE-${LEKKI.id}` })
    );
    fireEvent.click(row.getByText('Opening stock count'));

    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenNthCalledWith(1, OPENING_ID);
    expect(onOpen).toHaveBeenNthCalledWith(2, OPENING_ID);
  });

  it('keeps the masked cost readable to a screen reader', () => {
    setup();

    expect(screen.getByRole('img', { name: 'Hidden' })).toBeVisible();
  });
});
