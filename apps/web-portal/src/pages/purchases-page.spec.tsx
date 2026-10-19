import { screen, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import {
  ADA_ID,
  STRANGER_ID,
  TOBI_ID,
  portalChild,
  portalMe,
  portalPriceList,
  portalPurchase,
  portalPurchases,
  renderWithApi,
  testId,
} from '../test-utils';
import { PurchasesPage } from './purchases-page';

function tileOf(name: string): HTMLElement {
  const tile = screen
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(name) !== null);
  if (tile === undefined) {
    throw new Error(`No list item for ${name}`);
  }
  return tile;
}

const ada = portalChild({ id: ADA_ID, firstName: 'Ada' });
const tobi = portalChild({ id: TOBI_ID, firstName: 'Tobi' });
const guardian = portalMe({ children: [ada, tobi] });

function setup(
  options: {
    purchases?: ReturnType<typeof vi.fn>;
    priceList?: ReturnType<typeof vi.fn>;
    childId?: string;
    me?: ReturnType<typeof portalMe>;
  } = {}
) {
  const api = {
    portal: {
      purchases:
        options.purchases ?? vi.fn().mockResolvedValue(portalPurchases()),
      priceList:
        options.priceList ?? vi.fn().mockResolvedValue(portalPriceList()),
    },
  };
  renderWithApi(
    <PurchasesPage me={options.me ?? guardian} childId={options.childId} />,
    api
  );
  return api;
}

describe('PurchasesPage', () => {
  it('asks for the chosen child’s purchases and price list and names them in the header', async () => {
    const api = setup({ childId: TOBI_ID });

    expect(
      await screen.findByRole('heading', { name: 'Purchases' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Books, uniforms and other items bought for Tobi at the school store'
      )
    ).toBeVisible();
    expect(api.portal.purchases).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
    });
    expect(api.portal.priceList).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
    });
  });

  it('falls back to the first child for an id that is not linked', async () => {
    const api = setup({ childId: STRANGER_ID });

    await screen.findByRole('heading', { name: 'Purchases' });
    expect(api.portal.purchases).toHaveBeenCalledWith({
      params: { studentId: ADA_ID },
    });
    expect(api.portal.purchases).not.toHaveBeenCalledWith({
      params: { studentId: STRANGER_ID },
    });
  });

  it('shows the term’s spend, the items bought and the last purchase', async () => {
    setup();

    await screen.findByText('Spent this term');
    const spent = screen.getByRole('group', { name: 'Spent this term' });
    expect(within(spent).getByText('₦13,000')).toBeVisible();
    expect(within(spent).getByText('1 purchase in first term')).toBeVisible();
    const bought = screen.getByRole('group', { name: 'Items bought' });
    expect(within(bought).getByText('3')).toBeVisible();
    expect(within(bought).getByText('Books and uniforms')).toBeVisible();
    const last = screen.getByRole('group', { name: 'Last purchase' });
    expect(within(last).getByText('8 Sep 2026')).toBeVisible();
    expect(within(last).getByText('₦13,000 · paid at the store')).toBeVisible();
  });

  it('shows each sale’s lines and totals as given, with the campus store, receipt and how it was paid', async () => {
    setup({
      purchases: vi.fn().mockResolvedValue(
        portalPurchases({
          sales: [
            portalPurchase(),
            portalPurchase({
              id: testId(7),
              date: '2026-09-01',
              method: 'cash',
              receiptNumber: 'RCT-2026-00005',
              totalMinor: 400_000,
              lines: [
                {
                  itemName: 'Mathematics',
                  quantity: 1,
                  unitPriceMinor: 400_000,
                  amountMinor: 400_000,
                },
              ],
            }),
          ],
        })
      ),
    });

    expect(await screen.findByText('Purchase history')).toBeVisible();
    const first = screen.getByRole('group', {
      name: 'Purchase RCT-2026-00012',
    });
    expect(within(first).getByText('Paid by POS')).toBeVisible();
    expect(within(first).getByText('School shirt, Size 12')).toBeVisible();
    expect(within(first).getByText('₦4,500')).toBeVisible();
    expect(within(first).getByText('₦9,000')).toBeVisible();
    expect(within(first).getByText('Total')).toBeVisible();
    const older = screen.getByRole('group', {
      name: 'Purchase RCT-2026-00005',
    });
    expect(within(older).getByText('Paid by cash')).toBeVisible();
    const cards = screen.getAllByText(/campus store · receipt/);
    expect(cards.map((card) => card.textContent)).toEqual([
      'Lekki campus store · receipt RCT-2026-00012',
      'Lekki campus store · receipt RCT-2026-00005',
    ]);
  });

  it('says No purchases yet, with zeros and no last purchase, when nothing was bought', async () => {
    setup({
      purchases: vi.fn().mockResolvedValue(
        portalPurchases({
          spentThisTermMinor: 0,
          termPurchaseCount: 0,
          itemsBought: 0,
          sales: [],
        })
      ),
    });

    expect(await screen.findByText('No purchases yet')).toBeVisible();
    expect(
      screen.getByText(
        'Books and uniforms bought at the school store show up here with their receipts.'
      )
    ).toBeVisible();
    expect(screen.getByText('Nothing yet')).toBeVisible();
    expect(screen.getByText('0 purchases in first term')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
  });

  describe('the price list', () => {
    it('lists the level’s books and the uniforms with sizes and a price range, and marks what is out of stock', async () => {
      setup();

      expect(await screen.findByText('Store price list')).toBeVisible();
      expect(
        screen.getByText(
          'Paid at the store by cash, POS or bank transfer. Store items are not added to school fees.'
        )
      ).toBeVisible();
      expect(screen.getByText('Books for JSS 1')).toBeVisible();
      const basic = tileOf('Basic Science');
      expect(within(basic).getByText('Out of stock')).toBeVisible();
      expect(within(basic).getByText('₦3,400')).toBeVisible();
      const maths = screen
        .getAllByRole('listitem')
        .filter((tile) => within(tile).queryByText('Mathematics') !== null);
      expect(maths).toHaveLength(1);
      expect(
        within(maths[0]!).queryByText('Out of stock')
      ).not.toBeInTheDocument();
      const shirt = tileOf('School shirt');
      expect(
        within(shirt).getByText('Sizes Size 8, Size 10, Size 12')
      ).toBeVisible();
      expect(within(shirt).getByText('₦4,000 – ₦4,500')).toBeVisible();
      const tie = tileOf('School tie');
      expect(within(tie).getByText('One size')).toBeVisible();
      expect(within(tie).getByText('₦1,800')).toBeVisible();
      expect(within(tie).getByText('Out of stock')).toBeVisible();
    });

    it('names only the ways to pay that are on', async () => {
      setup({
        priceList: vi
          .fn()
          .mockResolvedValue(portalPriceList({ paymentMethods: ['cash'] })),
      });

      expect(
        await screen.findByText(
          'Paid at the store by cash. Store items are not added to school fees.'
        )
      ).toBeVisible();
    });

    it('omits a group with nothing in it and says No items listed when both are empty', async () => {
      setup({
        priceList: vi
          .fn()
          .mockResolvedValue(portalPriceList({ books: [], uniforms: [] })),
      });

      expect(await screen.findByText('No items listed')).toBeVisible();
      expect(screen.queryByText('Uniforms')).not.toBeInTheDocument();
      expect(screen.queryByText(/^Books for/)).not.toBeInTheDocument();
    });

    it('leaves out the books for a child with no books at their level', async () => {
      setup({
        priceList: vi.fn().mockResolvedValue(portalPriceList({ books: [] })),
      });

      expect(await screen.findByText('Uniforms')).toBeVisible();
      expect(screen.queryByText(/^Books for/)).not.toBeInTheDocument();
    });
  });

  it('shows the server’s refusal inline', async () => {
    setup({
      purchases: vi
        .fn()
        .mockRejectedValue(
          new ApiError(403, { code: 'Forbidden', message: 'No access here' })
        ),
    });

    expect(await screen.findByText('No access here')).toBeVisible();
  });

  it('asks the family to get their children linked when there are none', async () => {
    setup({ me: portalMe({ children: [] }) });

    expect(await screen.findByText('No children linked')).toBeVisible();
  });
});
