import { fireEvent, screen, within } from '@testing-library/react';
import { IKEJA, LEKKI } from '../../test-members';
import { SECOND_SALE_ID, sale, saleList, secondSale } from '../../test-store';
import { renderWithApi } from '../../test-utils';
import { ItemsSoldTable } from './items-sold-table';

function setup(
  options: {
    data?: ReturnType<typeof saleList>;
    showCampus?: boolean;
  } = {}
) {
  const onOpen = vi.fn();
  const onPage = vi.fn();
  renderWithApi(
    <ItemsSoldTable
      data={options.data ?? saleList()}
      campuses={[LEKKI, IKEJA]}
      showCampus={options.showCampus ?? false}
      page={1}
      onPage={onPage}
      onOpen={onOpen}
    />,
    {}
  );
  return { onOpen, onPage };
}

describe('ItemsSoldTable', () => {
  it('lists the sale with its student and class, items, total and paid receipt', () => {
    setup();

    const row = within(screen.getByRole('row', { name: /ISS-2026-0001/ }));
    expect(row.getByText('Ada Okeke')).toBeVisible();
    expect(row.getByText('JSS 1 Gold')).toBeVisible();
    expect(
      row.getByText('School shirt, Size 12 × 2, School tie × 1')
    ).toBeVisible();
    expect(row.getByText('₦13,000')).toBeVisible();
    expect(row.getByText('Paid · RCT-2026-00012')).toBeVisible();
    expect(row.getByRole('img', { name: 'Receipt uploaded' })).toBeVisible();
  });

  it('shows no proof icon when no receipt file was uploaded', () => {
    setup({ data: saleList([sale({ method: 'cash', proof: null })]) });

    expect(
      screen.queryByRole('img', { name: 'Receipt uploaded' })
    ).not.toBeInTheDocument();
  });

  it('adds a Campus column only when asked', () => {
    const { unmount } = renderWithApi(
      <ItemsSoldTable
        data={saleList()}
        campuses={[LEKKI, IKEJA]}
        showCampus
        page={1}
        onPage={vi.fn()}
        onOpen={vi.fn()}
      />,
      {}
    );
    expect(screen.getByRole('columnheader', { name: 'Campus' })).toBeVisible();
    unmount();
    setup();
    expect(
      screen.queryByRole('columnheader', { name: 'Campus' })
    ).not.toBeInTheDocument();
  });

  it('opens the clicked sale from the reference and from the other cells', () => {
    const { onOpen } = setup({ data: saleList([sale(), secondSale()]) });

    fireEvent.click(screen.getByRole('button', { name: 'ISS-2026-0002' }));
    fireEvent.click(screen.getByText('School tie × 3'));

    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenNthCalledWith(1, SECOND_SALE_ID);
    expect(onOpen).toHaveBeenNthCalledWith(2, SECOND_SALE_ID);
  });

  it('says Nothing sold yet when there are no sales', () => {
    setup({ data: saleList([]) });

    expect(screen.getByText('Nothing sold yet')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
