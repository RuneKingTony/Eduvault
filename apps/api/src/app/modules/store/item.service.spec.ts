import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  BOOK_LEVEL_REQUIRED_MESSAGE,
  BOOK_NO_SIZE_MESSAGE,
  ITEM_LEVEL_NOT_FOUND_MESSAGE,
  ITEM_NOT_FOUND_MESSAGE,
  ITEM_PRICE_BELOW_COST_MESSAGE,
  ITEM_RETIRED_EDIT_MESSAGE,
  STORE_CAMPUS_NOT_FOUND_MESSAGE,
  UNIFORM_NO_LEVEL_MESSAGE,
  itemDuplicateMessage,
  itemListQuerySchema,
  type CreateItem,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  FakeStoreRepository,
  storeItem,
  storeRef,
} from './fake-store.repository';
import { ItemService } from './item.service';

const LEVEL = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const LEKKI = '7c9a0b3d-1f2e-4a5b-8c6d-9e0f1a2b3c4d';
const IKEJA = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';

const ctx = (campusScope: 'all' | string[] = 'all') =>
  ({
    organizationId: 'school-a',
    user: { id: 'chika', email: 'chika@eduvault.test', name: 'Chika' },
    campusScope,
  }) as unknown as OrgContext;

const query = (input: Parameters<typeof itemListQuerySchema.parse>[0] = {}) =>
  itemListQuerySchema.parse(input);

const uniform: CreateItem = {
  kind: 'uniform',
  name: 'School shirt',
  variant: 'Size 12',
  classLevelId: null,
  costPriceMinor: 350_000,
  sellPriceMinor: 450_000,
  lowStockLevel: 5,
};

function setup() {
  const repository = new FakeStoreRepository();
  repository.stores = [
    storeRef('lekki', 'Lekki', LEKKI),
    storeRef('ikeja', 'Ikeja', IKEJA),
  ];
  repository.levels.set(LEVEL, 'JSS 1');
  return { repository, service: new ItemService(repository) };
}

describe('ItemService.list', () => {
  it('gives one stock row per campus in scope, with the average cost and the state', async () => {
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
        onHand: 4,
        valueMinor: 1_400_001,
      },
    ];

    const { items, total } = await service.list(ctx(), query());

    expect(total).toBe(1);
    expect(items[0]).toMatchObject({
      displayName: 'School shirt, Size 12',
      state: 'low',
      stock: [
        {
          campusId: LEKKI,
          onHand: 10,
          valueMinor: 3_500_000,
          averageCostMinor: 350_000,
        },
        {
          campusId: IKEJA,
          onHand: 4,
          valueMinor: 1_400_001,
          averageCostMinor: 350_000,
        },
      ],
    });
  });

  it('shows zero where nothing has moved and only the campuses in scope', async () => {
    const { repository, service } = setup();
    repository.items = [storeItem()];

    const { items } = await service.list(ctx([LEKKI]), query());

    expect(items[0]?.stock).toEqual([
      { campusId: LEKKI, onHand: 0, valueMinor: 0, averageCostMinor: 0 },
    ]);
    expect(items[0]?.state).toBe('out');
  });

  it('narrows to the campus filter and refuses one outside scope', async () => {
    const { repository, service } = setup();
    repository.items = [storeItem()];

    const { items } = await service.list(ctx(), query({ campusId: IKEJA }));
    expect(items[0]?.stock.map((row) => row.campusId)).toEqual([IKEJA]);

    await expect(
      service.list(ctx([LEKKI]), query({ campusId: IKEJA }))
    ).rejects.toThrow(new NotFoundException(STORE_CAMPUS_NOT_FOUND_MESSAGE));
    await expect(
      service.list(
        ctx(),
        query({ campusId: '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10' })
      )
    ).rejects.toThrow(new NotFoundException(STORE_CAMPUS_NOT_FOUND_MESSAGE));
  });

  it('keeps only low or out items for lowOnly and never a retired one', async () => {
    const { repository, service } = setup();
    const plenty = storeItem({ name: 'Tie', variant: null });
    const low = storeItem({ name: 'Pinafore' });
    const retired = storeItem({
      name: 'Old badge',
      variant: null,
      retiredAt: '2026-09-01T00:00:00.000Z',
    });
    repository.items = [plenty, low, retired];
    repository.totals = [
      { storeId: 'store-lekki', itemId: plenty.id, onHand: 50, valueMinor: 1 },
      { storeId: 'store-ikeja', itemId: plenty.id, onHand: 50, valueMinor: 1 },
      { storeId: 'store-lekki', itemId: low.id, onHand: 2, valueMinor: 1 },
      { storeId: 'store-ikeja', itemId: low.id, onHand: 50, valueMinor: 1 },
    ];

    const result = await service.list(
      ctx(),
      query({ lowOnly: true, includeRetired: true })
    );

    expect(result.items.map((item) => item.name)).toEqual(['Pinafore']);
    expect(result.total).toBe(1);
  });

  it('passes the kind, search and retired filters to the repository', async () => {
    const { repository, service } = setup();
    const listItems = vi.spyOn(repository, 'listItems');

    await service.list(ctx(), query({ kind: 'book', q: 'math' }));

    expect(listItems).toHaveBeenCalledWith('school-a', {
      kind: 'book',
      q: 'math',
      includeRetired: false,
    });
  });

  it('pages the items', async () => {
    const { repository, service } = setup();
    repository.items = Array.from({ length: 12 }, (_, index) =>
      storeItem({ name: `Item ${index}`, variant: null })
    );

    const second = await service.list(ctx(), query({ page: 2 }));

    expect(second.total).toBe(12);
    expect(second.items.map((item) => item.name)).toEqual([
      'Item 10',
      'Item 11',
    ]);
  });
});

describe('ItemService.create', () => {
  it('creates an item with no stock yet', async () => {
    const { repository, service } = setup();

    const item = await service.create(ctx(), uniform);

    expect(item).toMatchObject({
      displayName: 'School shirt, Size 12',
      state: 'out',
      costPriceMinor: 350_000,
      sellPriceMinor: 450_000,
    });
    expect(repository.items).toHaveLength(1);
  });

  it('creates a book on a class level of the school', async () => {
    const { repository, service } = setup();

    await service.create(ctx(), {
      ...uniform,
      kind: 'book',
      name: 'Mathematics',
      variant: null,
      classLevelId: LEVEL,
    });

    expect(repository.items[0]?.classLevel?.id).toBe(LEVEL);
  });

  it('answers 404 for a class level of another school', async () => {
    const { service } = setup();
    await expect(
      service.create(ctx(), {
        ...uniform,
        kind: 'book',
        variant: null,
        classLevelId: '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10',
      })
    ).rejects.toThrow(new NotFoundException(ITEM_LEVEL_NOT_FOUND_MESSAGE));
  });

  it('answers 409 for a duplicate active item and names it', async () => {
    const { service } = setup();
    await service.create(ctx(), uniform);

    await expect(service.create(ctx(), uniform)).rejects.toThrow(
      new ConflictException(itemDuplicateMessage('School shirt, Size 12'))
    );
  });

  it.each([
    [
      'a book without a level',
      { kind: 'book', variant: null },
      BOOK_LEVEL_REQUIRED_MESSAGE,
    ],
    [
      'a uniform with a level',
      { classLevelId: LEVEL },
      UNIFORM_NO_LEVEL_MESSAGE,
    ],
    [
      'a size on a book',
      { kind: 'book', variant: 'Size 12', classLevelId: LEVEL },
      BOOK_NO_SIZE_MESSAGE,
    ],
    [
      'a price below cost',
      { costPriceMinor: 500_000 },
      ITEM_PRICE_BELOW_COST_MESSAGE,
    ],
  ] satisfies [string, Partial<CreateItem>, string][])(
    'answers 400 for %s',
    async (_name, change, message) => {
      const { repository, service } = setup();

      await expect(
        service.create(ctx(), { ...uniform, ...change })
      ).rejects.toThrow(new BadRequestException(message));
      expect(repository.items).toHaveLength(0);
    }
  );

  it('accepts a zero cost price', async () => {
    const { service } = setup();
    await expect(
      service.create(ctx(), { ...uniform, costPriceMinor: 0 })
    ).resolves.toMatchObject({ costPriceMinor: 0 });
  });
});

describe('ItemService.update', () => {
  it('forwards the edited name and low-stock level', async () => {
    const { repository, service } = setup();
    const shirt = storeItem();
    repository.items = [shirt];

    await service.update(ctx(), shirt.id, {
      name: 'Polo shirt',
      lowStockLevel: 8,
    });

    expect(repository.items[0]).toMatchObject({
      displayName: 'Polo shirt, Size 12',
      lowStockLevel: 8,
    });
  });

  it('refuses a selling price below the stored cost', async () => {
    const { repository, service } = setup();
    const shirt = storeItem();
    repository.items = [shirt];

    await expect(
      service.update(ctx(), shirt.id, { sellPriceMinor: 300_000 })
    ).rejects.toThrow(new BadRequestException(ITEM_PRICE_BELOW_COST_MESSAGE));
    await expect(
      service.update(ctx(), shirt.id, { costPriceMinor: 500_000 })
    ).rejects.toThrow(new BadRequestException(ITEM_PRICE_BELOW_COST_MESSAGE));
    expect(repository.priceChanges).toHaveLength(0);
  });

  it('answers 404 for an unknown item', async () => {
    const { service } = setup();
    await expect(service.update(ctx(), 'nope', { name: 'X' })).rejects.toThrow(
      new NotFoundException(ITEM_NOT_FOUND_MESSAGE)
    );
  });

  it('answers 409 for a retired item', async () => {
    const { repository, service } = setup();
    const old = storeItem({ retiredAt: '2026-09-01T00:00:00.000Z' });
    repository.items = [old];

    await expect(service.update(ctx(), old.id, { name: 'X' })).rejects.toThrow(
      new ConflictException(ITEM_RETIRED_EDIT_MESSAGE)
    );
  });

  it('retires an item with retired true and then refuses further edits', async () => {
    const { repository, service } = setup();
    const shirt = storeItem();
    repository.items = [shirt];

    const retired = await service.update(ctx(), shirt.id, { retired: true });

    expect(retired.retiredAt).not.toBeNull();
    await expect(
      service.update(ctx(), shirt.id, { name: 'Again' })
    ).rejects.toThrow(new ConflictException(ITEM_RETIRED_EDIT_MESSAGE));
  });

  it('answers 409 when the new name collides with another active item', async () => {
    const { repository, service } = setup();
    const size12 = storeItem();
    const size14 = storeItem({ variant: 'Size 14' });
    repository.items = [size12, size14];

    await expect(
      service.update(ctx(), size14.id, { variant: 'Size 12' })
    ).rejects.toThrow(
      new ConflictException(itemDuplicateMessage('School shirt, Size 12'))
    );
  });

  it('refuses a size on a book', async () => {
    const { repository, service } = setup();
    const book = storeItem({
      kind: 'book',
      name: 'Mathematics',
      variant: null,
      classLevel: { id: LEVEL, name: 'JSS 1' },
    });
    repository.items = [book];

    await expect(
      service.update(ctx(), book.id, { variant: 'Size 12' })
    ).rejects.toThrow(new BadRequestException(BOOK_NO_SIZE_MESSAGE));
  });
});
