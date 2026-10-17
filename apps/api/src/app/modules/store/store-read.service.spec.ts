import { NotFoundException } from '@nestjs/common';
import { deliveryListQuerySchema } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  FakeStoreRepository,
  storeItem,
  storeRef,
} from './fake-store.repository';
import { StoreReadService } from './store-read.service';

const ctx = (campusScope: 'all' | string[] = 'all') =>
  ({
    organizationId: 'school-a',
    user: { id: 'chika', email: 'chika@eduvault.test', name: 'Chika' },
    campusScope,
  }) as unknown as OrgContext;

function setup() {
  const repository = new FakeStoreRepository();
  repository.stores = [storeRef('lekki', 'Lekki'), storeRef('ikeja', 'Ikeja')];
  return { repository, service: new StoreReadService(repository) };
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
    });
    expect(await service.summary(ctx(['lekki']))).toEqual({
      stockValueMinor: 3_500_000,
      lowCount: 0,
    });
    expect(await service.summary(ctx(), 'ikeja')).toEqual({
      stockValueMinor: 700_000,
      lowCount: 1,
    });
  });

  it('answers 404 for a campus outside scope', async () => {
    const { service } = setup();
    await expect(service.summary(ctx(['lekki']), 'ikeja')).rejects.toThrow(
      new NotFoundException('Campus not found')
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
    });
    expect(await service.dashboardStore(ctx(['ikeja']))).toEqual({
      stockValueMinor: 700_000,
    });
  });
});

describe('StoreReadService deliveries', () => {
  it('lists a page with the suppliers over the whole scope', async () => {
    const { repository, service } = setup();
    repository.suppliers = ['Adebayo Uniforms Ltd'];

    const result = await service.deliveries(
      ctx(),
      deliveryListQuerySchema.parse({})
    );

    expect(result).toEqual({
      items: [],
      total: 0,
      suppliers: ['Adebayo Uniforms Ltd'],
    });
  });

  it('answers 404 for a campus filter outside scope', async () => {
    const { service } = setup();
    await expect(
      service.deliveries(
        ctx(['lekki']),
        deliveryListQuerySchema.parse({
          campusId: '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10',
        })
      )
    ).rejects.toThrow(NotFoundException);
  });

  it('answers 404 for an unknown delivery', async () => {
    const { service } = setup();
    await expect(service.delivery(ctx(), 'nope')).rejects.toThrow(
      new NotFoundException('Delivery not found')
    );
  });
});
