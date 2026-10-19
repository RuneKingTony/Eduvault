import { NotFoundException } from '@nestjs/common';
import {
  PAYMENT_STUDENT_NOT_FOUND_MESSAGE,
  STORE_CAMPUS_NOT_FOUND_MESSAGE,
  deliveryListQuerySchema,
  saleListQuerySchema,
} from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import {
  FakeStoreRepository,
  storeItem,
  storeRef,
} from './fake-store.repository';
import { Clock } from '../../common/clock';
import {
  FakeSaleRepository,
  noTermFigures,
  saleAccount,
} from './fake-sale.repository';
import { StoreReadService } from './store-read.service';

const ctx = (
  campusScope: 'all' | string[] = 'all',
  permissions: Permission[] = ['store:issue', 'payment:read']
) =>
  ({
    organizationId: 'school-a',
    user: { id: 'chika', email: 'chika@eduvault.test', name: 'Chika' },
    permissions: toPermissionMap(permissions),
    campusScope,
  }) as unknown as OrgContext;

function setup() {
  const repository = new FakeStoreRepository();
  repository.stores = [storeRef('lekki', 'Lekki'), storeRef('ikeja', 'Ikeja')];
  const sales = new FakeSaleRepository();
  const clock = new Clock();
  clock.set('2026-10-07');
  return {
    repository,
    sales,
    service: new StoreReadService(repository, sales, clock),
  };
}

const names = ['Tie', 'Pinafore', 'Trousers', 'Sportswear set', 'School shirt'];

describe('StoreReadService low stock', () => {
  it('counts low and out items and names the first three', async () => {
    const { repository, service } = setup();
    repository.items = names.map((name) => storeItem({ name, variant: null }));

    const { count, names: first } = await service.lowStockTask(ctx());

    expect(count).toBe(5);
    expect(first).toEqual(['Tie', 'Pinafore', 'Trousers']);
  });

  it('leaves out items that are well stocked on every campus and retired ones', async () => {
    const { repository, service } = setup();
    const plenty = storeItem({ name: 'Tie', variant: null });
    const low = storeItem({ name: 'Pinafore', variant: null });
    const retired = storeItem({
      name: 'Old badge',
      variant: null,
      retiredAt: '2026-09-01T00:00:00.000Z',
    });
    repository.items = [plenty, low, retired];
    repository.totals = [
      { storeId: 'store-lekki', itemId: plenty.id, onHand: 20, valueMinor: 1 },
      { storeId: 'store-ikeja', itemId: plenty.id, onHand: 20, valueMinor: 1 },
      { storeId: 'store-lekki', itemId: low.id, onHand: 5, valueMinor: 1 },
      { storeId: 'store-ikeja', itemId: low.id, onHand: 20, valueMinor: 1 },
    ];

    expect(await service.lowStockTask(ctx())).toEqual({
      count: 1,
      names: ['Pinafore'],
    });
  });

  it('reads only the campuses in scope', async () => {
    const { repository, service } = setup();
    const shirt = storeItem();
    repository.items = [shirt];
    repository.totals = [
      { storeId: 'store-lekki', itemId: shirt.id, onHand: 50, valueMinor: 1 },
      { storeId: 'store-ikeja', itemId: shirt.id, onHand: 0, valueMinor: 0 },
    ];

    expect((await service.lowStockTask(ctx(['lekki']))).count).toBe(0);
    expect((await service.lowStockTask(ctx())).count).toBe(1);
  });

  it('has no low items when there are no items', async () => {
    const { service } = setup();
    expect(await service.lowStockTask(ctx())).toEqual({ count: 0, names: [] });
  });
});

describe('StoreReadService.summary', () => {
  it('sums the stock value in scope and counts low items', async () => {
    const { repository, service } = setup();
    const shirt = storeItem();
    repository.items = [shirt];
    repository.totals = [
      {
        storeId: 'store-lekki',
        itemId: shirt.id,
        onHand: 10,
        valueMinor: 3_500_000,
      },
      {
        storeId: 'store-ikeja',
        itemId: shirt.id,
        onHand: 2,
        valueMinor: 700_000,
      },
    ];

    expect(await service.summary(ctx())).toEqual({
      stockValueMinor: 4_200_000,
      lowCount: 1,
      ...noTermFigures,
    });
    expect(await service.summary(ctx(['lekki']))).toEqual({
      stockValueMinor: 3_500_000,
      lowCount: 0,
      ...noTermFigures,
    });
    expect(await service.summary(ctx(), 'ikeja')).toEqual({
      stockValueMinor: 700_000,
      lowCount: 1,
      ...noTermFigures,
    });
  });

  it('answers 404 for a campus outside scope', async () => {
    const { service } = setup();
    await expect(service.summary(ctx(['lekki']), 'ikeja')).rejects.toThrow(
      new NotFoundException(STORE_CAMPUS_NOT_FOUND_MESSAGE)
    );
  });

  it('gives the dashboard the stock value in scope', async () => {
    const { repository, service } = setup();
    const shirt = storeItem();
    repository.items = [shirt];
    repository.totals = [
      {
        storeId: 'store-lekki',
        itemId: shirt.id,
        onHand: 10,
        valueMinor: 3_500_000,
      },
      {
        storeId: 'store-ikeja',
        itemId: shirt.id,
        onHand: 2,
        valueMinor: 700_000,
      },
    ];

    expect(await service.dashboardStore(ctx())).toEqual({
      stockValueMinor: 4_200_000,
      ...noTermFigures,
    });
    expect(await service.dashboardStore(ctx(['ikeja']))).toEqual({
      stockValueMinor: 700_000,
      ...noTermFigures,
    });
  });
});

describe('StoreReadService sales', () => {
  it('lists ten to a page after checking the campus filter', async () => {
    const { sales, service } = setup();
    await service.saleList(ctx(), saleListQuerySchema.parse({ page: '2' }));
    expect(sales.listed).toEqual([{ page: 2, pageSize: 10 }]);
    await expect(
      service.saleList(
        ctx(['lekki']),
        saleListQuerySchema.parse({
          campusId: '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10',
        })
      )
    ).rejects.toThrow(new NotFoundException('Campus not found'));
  });

  it('answers 404 for a sale that is not found', async () => {
    const { service } = setup();
    await expect(service.sale(ctx(), 'nope')).rejects.toThrow(
      new NotFoundException('Sale not found')
    );
  });

  it('offers the sheet only open accounts that are not gateways', async () => {
    const { sales, service } = setup();
    sales.accountRows = [
      saleAccount({ id: 'cash', kind: 'cash' }),
      saleAccount({ id: 'old', kind: 'pos', retired: true }),
      saleAccount({ id: 'gate', kind: 'gateway' }),
    ];
    sales.methods = { cash: true, transfer: false, pos: true };

    const options = await service.saleOptions(ctx());

    expect(options.accounts).toEqual([
      { id: 'cash', name: 'Lekki cash box', kind: 'cash', campusId: 'lekki' },
    ]);
    expect(options.methods).toEqual({ cash: true, transfer: false, pos: true });
  });

  it('asks for fee balances only from a caller who can read payments', async () => {
    const { sales, service } = setup();
    await service.saleOptions(ctx('all', ['store:issue']));
    expect(sales.optionRequests.at(-1)).toMatchObject({ withBalance: false });
    await service.saleOptions(ctx());
    expect(sales.optionRequests.at(-1)).toMatchObject({ withBalance: true });
  });
});

describe('StoreReadService portal reads', () => {
  it('builds the price list from the child’s campus store', async () => {
    const { repository, sales, service } = setup();
    const maths = storeItem({
      kind: 'book',
      name: 'Mathematics',
      variant: null,
      classLevel: { id: 'jss2', name: 'JSS 2' },
    });
    const tie = storeItem({ name: 'Tie', variant: null });
    repository.items = [maths, tie];
    repository.totals = [
      { storeId: 'store-lekki', itemId: maths.id, onHand: 0, valueMinor: 0 },
      { storeId: 'store-lekki', itemId: tie.id, onHand: 3, valueMinor: 30 },
      { storeId: 'store-ikeja', itemId: maths.id, onHand: 9, valueMinor: 90 },
    ];
    sales.placement = {
      levelId: 'jss2',
      levelName: 'JSS 2',
      campusId: 'lekki',
    };
    sales.methods = { cash: true, transfer: false, pos: true };

    expect(await service.priceListFor(ctx(), 'ada')).toEqual({
      levelName: 'JSS 2',
      books: [{ name: 'Mathematics', priceMinor: 450_000, inStock: false }],
      uniforms: [
        {
          name: 'Tie',
          sizes: [],
          minPriceMinor: 450_000,
          maxPriceMinor: 450_000,
          inStock: true,
        },
      ],
      paymentMethods: ['cash', 'pos'],
    });
  });

  it('answers 404 for a student with no placement', async () => {
    const { service } = setup();
    await expect(service.priceListFor(ctx(), 'ghost')).rejects.toThrow(
      new NotFoundException(PAYMENT_STUDENT_NOT_FOUND_MESSAGE)
    );
  });
});

describe('StoreReadService deliveries', () => {
  it('answers 404 for a campus filter outside scope', async () => {
    const { service } = setup();
    await expect(
      service.deliveries(
        ctx(['lekki']),
        deliveryListQuerySchema.parse({
          campusId: '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10',
        })
      )
    ).rejects.toThrow(new NotFoundException(STORE_CAMPUS_NOT_FOUND_MESSAGE));
  });

  it('answers 404 for an unknown delivery', async () => {
    const { service } = setup();
    await expect(service.delivery(ctx(), 'nope')).rejects.toThrow(
      new NotFoundException('Delivery not found')
    );
  });
});
