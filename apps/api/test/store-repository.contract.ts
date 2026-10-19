import { randomUUID } from 'node:crypto';
import type {
  ItemChange,
  ItemRecord,
  NewItem,
  StoreRepository,
} from '../src/app/modules/store/store.repository';

export interface StoreHarness {
  repository: StoreRepository;
  schoolA: string;
  schoolB: string;
  userId: string;
  /** Class levels of school A, and one of school B. */
  levels: { jss1: string; jss2: string; otherSchool: string };
  /** Campuses of school A that each have a store. */
  campuses: { lekki: string; ikeja: string };
}

/** How a runner registers a scenario: it supplies the harness, the contract supplies the title and the assertions. */
type TestFn = (
  title: string,
  run: (harness: StoreHarness) => Promise<void>
) => unknown;

const newItem = (
  harness: StoreHarness,
  overrides: Partial<NewItem> = {}
): NewItem => ({
  organizationId: harness.schoolA,
  userId: harness.userId,
  kind: 'uniform',
  name: 'School shirt',
  variant: 'Size 12',
  classLevelId: null,
  costPriceMinor: 350_000,
  sellPriceMinor: 450_000,
  lowStockLevel: 5,
  ...overrides,
});

const change = (
  harness: StoreHarness,
  itemId: string,
  overrides: Partial<ItemChange> = {}
): ItemChange => ({
  organizationId: harness.schoolA,
  userId: harness.userId,
  itemId,
  retire: false,
  ...overrides,
});

async function created(
  harness: StoreHarness,
  overrides: Partial<NewItem> = {}
): Promise<ItemRecord> {
  const outcome = await harness.repository.insertItem(
    newItem(harness, overrides)
  );
  if (outcome.status !== 'created') {
    throw new Error(`Expected the item to be created, got ${outcome.status}`);
  }
  return outcome.item;
}

const book = (name: string, level: string): Partial<NewItem> => ({
  kind: 'book',
  name,
  variant: null,
  classLevelId: level,
});

const byText = (a: string, b: string) => a.localeCompare(b);

const namesOf = (items: ItemRecord[]): string[] =>
  items.map((item) => item.displayName).toSorted(byText);

/**
 * The rules the store unit tests lean on, written once and run against the in-memory fake
 * and the Postgres repository, so the fake cannot drift from the schema unnoticed.
 */
export function describeStoreRepositoryContract(test: TestFn): void {
  test('reads back what it inserted', async (harness) => {
    const item = await created(harness);

    await expect(
      harness.repository.findItem(harness.schoolA, item.id)
    ).resolves.toMatchObject({
      id: item.id,
      kind: 'uniform',
      name: 'School shirt',
      variant: 'Size 12',
      displayName: 'School shirt, Size 12',
      classLevel: null,
      costPriceMinor: 350_000,
      sellPriceMinor: 450_000,
      lowStockLevel: 5,
      retiredAt: null,
    });
  });

  test('puts a book on its class level', async (harness) => {
    const item = await created(
      harness,
      book('Mathematics', harness.levels.jss1)
    );

    expect(item.classLevel).toEqual({
      id: harness.levels.jss1,
      name: 'JSS 1',
    });
  });

  test('refuses a second active item with the same name and variant', async (harness) => {
    await created(harness);

    await expect(
      harness.repository.insertItem(newItem(harness))
    ).resolves.toEqual({ status: 'duplicate' });
    await expect(
      harness.repository.insertItem(newItem(harness, { variant: 'Size 14' }))
    ).resolves.toMatchObject({ status: 'created' });
  });

  test('keeps the same book name apart per class level but not within one', async (harness) => {
    await created(harness, book('Mathematics', harness.levels.jss1));
    await expect(
      harness.repository.insertItem(
        newItem(harness, book('Mathematics', harness.levels.jss2))
      )
    ).resolves.toMatchObject({ status: 'created' });

    await expect(
      harness.repository.insertItem(
        newItem(harness, book('Mathematics', harness.levels.jss1))
      )
    ).resolves.toEqual({ status: 'duplicate' });
  });

  test('lets a name be used again once its item is retired', async (harness) => {
    const first = await created(harness);

    const retired = await harness.repository.updateItem(
      change(harness, first.id, { retire: true })
    );

    expect(retired).toMatchObject({ status: 'updated' });
    await expect(
      harness.repository.insertItem(newItem(harness))
    ).resolves.toMatchObject({ status: 'created' });
  });

  test('refuses a rename onto another active item, but not onto the same name on another level', async (harness) => {
    await created(harness);
    const size14 = await created(harness, { variant: 'Size 14' });

    await expect(
      harness.repository.updateItem(
        change(harness, size14.id, { variant: 'Size 12' })
      )
    ).resolves.toEqual({ status: 'duplicate' });

    await created(harness, book('Mathematics', harness.levels.jss1));
    const workbook = await created(
      harness,
      book('Mathematics workbook', harness.levels.jss2)
    );
    await expect(
      harness.repository.updateItem(
        change(harness, workbook.id, { name: 'Mathematics' })
      )
    ).resolves.toMatchObject({
      status: 'updated',
      item: { displayName: 'Mathematics' },
    });
  });

  test('answers missing for an unknown item and retired for an edit after retiring', async (harness) => {
    await expect(
      harness.repository.updateItem(
        change(harness, randomUUID(), { name: 'X' })
      )
    ).resolves.toEqual({ status: 'missing' });

    const item = await created(harness);
    await harness.repository.updateItem(
      change(harness, item.id, { retire: true })
    );

    await expect(
      harness.repository.updateItem(change(harness, item.id, { name: 'X' }))
    ).resolves.toEqual({ status: 'retired' });
  });

  test('edits the prices and the low-stock level', async (harness) => {
    const item = await created(harness);

    await expect(
      harness.repository.updateItem(
        change(harness, item.id, {
          costPriceMinor: 400_000,
          sellPriceMinor: 500_000,
          lowStockLevel: 8,
        })
      )
    ).resolves.toMatchObject({
      status: 'updated',
      item: {
        costPriceMinor: 400_000,
        sellPriceMinor: 500_000,
        lowStockLevel: 8,
        retiredAt: null,
      },
    });
  });

  test('filters the list by kind, text and retired', async (harness) => {
    await created(harness);
    await created(harness, { name: 'Tie', variant: null });
    await created(harness, book('Mathematics', harness.levels.jss1));
    const old = await created(harness, { variant: 'Size 14' });
    await harness.repository.updateItem(
      change(harness, old.id, { retire: true })
    );
    const list = (filter: {
      kind?: 'uniform' | 'book';
      q?: string;
      includeRetired: boolean;
    }) => harness.repository.listItems(harness.schoolA, filter);

    expect(namesOf(await list({ includeRetired: false }))).toEqual([
      'Mathematics',
      'School shirt, Size 12',
      'Tie',
    ]);
    expect(namesOf(await list({ includeRetired: true }))).toHaveLength(4);
    expect(
      namesOf(await list({ kind: 'book', includeRetired: false }))
    ).toEqual(['Mathematics']);
    expect(namesOf(await list({ q: 'SHIRT', includeRetired: false }))).toEqual([
      'School shirt, Size 12',
    ]);
    expect(namesOf(await list({ q: 'size', includeRetired: false }))).toEqual([
      'School shirt, Size 12',
    ]);
    expect(namesOf(await list({ q: 'jss 1', includeRetired: false }))).toEqual([
      'Mathematics',
    ]);
  });

  test('finds items by id, and none for an empty list', async (harness) => {
    const shirt = await created(harness);
    const tie = await created(harness, { name: 'Tie', variant: null });

    const found = await harness.repository.findItems(harness.schoolA, [
      shirt.id,
      tie.id,
    ]);

    expect(found.map((item) => item.id).toSorted(byText)).toEqual(
      [shirt.id, tie.id].toSorted(byText)
    );
    await expect(
      harness.repository.findItems(harness.schoolA, [])
    ).resolves.toEqual([]);
  });

  test('keeps one school’s items, levels and names from another', async (harness) => {
    const item = await created(harness);
    const { repository } = harness;

    await expect(
      repository.findItem(harness.schoolB, item.id)
    ).resolves.toBeUndefined();
    await expect(
      repository.findItems(harness.schoolB, [item.id])
    ).resolves.toEqual([]);
    await expect(
      repository.listItems(harness.schoolB, { includeRetired: true })
    ).resolves.toEqual([]);
    await expect(
      repository.updateItem({
        ...change(harness, item.id, { name: 'X' }),
        organizationId: harness.schoolB,
      })
    ).resolves.toEqual({ status: 'missing' });
    await expect(
      repository.insertItem({
        ...newItem(harness),
        organizationId: harness.schoolB,
      })
    ).resolves.toMatchObject({ status: 'created' });
    await expect(
      repository.classLevel(harness.schoolA, harness.levels.jss1)
    ).resolves.toEqual({ id: harness.levels.jss1, name: 'JSS 1' });
    await expect(
      repository.classLevel(harness.schoolB, harness.levels.jss1)
    ).resolves.toBeUndefined();
    await expect(
      repository.classLevel(harness.schoolA, harness.levels.otherSchool)
    ).resolves.toBeUndefined();
  });

  test('lists only the stores in the campus scope, of the school asked about', async (harness) => {
    const { lekki, ikeja } = harness.campuses;
    const campusesIn = async (
      organizationId: string,
      campusScope: 'all' | string[]
    ) =>
      (
        await harness.repository.storesInScope({
          organizationId,
          campusScope,
        })
      )
        .map((store) => store.campusId)
        .toSorted(byText);

    expect(await campusesIn(harness.schoolA, 'all')).toEqual(
      [lekki, ikeja].toSorted(byText)
    );
    expect(await campusesIn(harness.schoolA, [lekki])).toEqual([lekki]);
    expect(await campusesIn(harness.schoolA, [])).toEqual([]);
    expect(await campusesIn(harness.schoolB, 'all')).not.toContain(lekki);
  });
}
