import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  ITEM_NOT_FOUND_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  STOCK_COUNT_CLASH_MESSAGE,
  STOCK_MOVED_MESSAGE,
  STORE_CAMPUS_NOT_FOUND_MESSAGE,
  stockCountRetiredItemMessage,
  stockCountWaitingMessage,
  type SubmitStockCount,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { FakeStockCountRepository } from './fake-stock-count.repository';
import { StockCountService } from './stock-count.service';
import type { ItemRecord } from './store.repository';

const LEKKI = 'lekki';
const STORE = 'store-lekki';
const TIE = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const SHIRT = '6f1d2a7c-3b0e-4e53-9c55-0d6a3f5f2b10';

const as = (id: string) =>
  ({
    organizationId: 'school-a',
    user: { id, email: `${id}@eduvault.test`, name: id },
    campusScope: 'all',
  }) as unknown as OrgContext;

const FIRST_PAGE = { page: 1, pageSize: 10 };

const chika = as('chika');
const grace = as('grace');

const item = (
  over: Partial<ItemRecord> & Pick<ItemRecord, 'id'>
): ItemRecord => ({
  kind: 'uniform',
  name: 'School tie',
  variant: null,
  displayName: 'School tie',
  classLevel: null,
  costPriceMinor: 120_000,
  sellPriceMinor: 180_000,
  lowStockLevel: 10,
  retiredAt: null,
  ...over,
});

const submission = (...counted: [string, number][]): SubmitStockCount => ({
  campusId: LEKKI,
  note: null,
  lines: counted.map(([itemId, countedQuantity]) => ({
    itemId,
    countedQuantity,
  })),
});

function setup() {
  const repo = new FakeStockCountRepository();
  repo.seedStore({
    id: STORE,
    campusId: LEKKI,
    campusName: 'Lekki',
    name: 'Lekki campus store',
  });
  repo.seedItem(item({ id: TIE }));
  repo.seedItem(
    item({
      id: SHIRT,
      name: 'School shirt',
      variant: 'Size 14',
      displayName: 'School shirt, Size 14',
      costPriceMinor: 300_000,
    })
  );
  repo.setStock(STORE, TIE, { onHand: 3, valueMinor: 350_000 });
  repo.setStock(STORE, SHIRT, { onHand: 4, valueMinor: 1_300_000 });
  const clock = new Clock({ NODE_ENV: 'test' });
  clock.set('2026-10-17');
  return { repo, service: new StockCountService(repo, clock) };
}

const rejected = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be refused');
};

describe('StockCountService.submit', () => {
  it('keeps a count that matches as matched, with every line and nothing posted', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 3], [SHIRT, 4]));
    expect(count).toMatchObject({
      number: 'CNT-2026-0001',
      status: 'matched',
      netValueMinor: 0,
      differences: 'matches',
      decidedBy: null,
    });
    expect(count.lines).toHaveLength(2);
    expect(repo.movements).toEqual([]);
    expect(repo.posted).toEqual([]);
  });

  it('makes a count with a difference wait, valued at the average', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 2], [SHIRT, 4]));
    expect(count).toMatchObject({
      status: 'submitted',
      netValueMinor: 116_667,
      differences: 'School tie: 1 missing',
      countedBy: { id: 'chika' },
    });
    expect(repo.movements).toEqual([]);
    expect(repo.posted).toEqual([]);
  });

  it('reads expected stock under the lock, not from the request', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    expect(count.lines[0]).toMatchObject({
      expectedQuantity: 3,
      countedQuantity: 2,
      difference: -1,
    });
    expect(repo.lockedItems).toEqual([[TIE]]);
  });

  it('applies the count at once when write-off approval is off', async () => {
    const { repo, service } = setup();
    repo.switchedOff = true;
    const count = await service.submit(chika, submission([TIE, 2]));
    expect(count).toMatchObject({ status: 'approved', decidedBy: null });
    expect(repo.movements).toEqual([
      { itemId: TIE, quantity: -1, valueMinor: -116_667, number: count.number },
    ]);
    expect(repo.posted).toHaveLength(1);
    expect(repo.posted[0]).toMatchObject({
      kind: 'store_count',
      reference: count.number,
      postedBy: 'chika',
    });
  });

  it('applies a matched count with no movements even when approval is off', async () => {
    const { repo, service } = setup();
    repo.switchedOff = true;
    const count = await service.submit(chika, submission([TIE, 3]));
    expect(count.status).toBe('matched');
    expect(repo.movements).toEqual([]);
  });

  it('answers 409 with the waiting number when the store already has one', async () => {
    const { service } = setup();
    await service.submit(chika, submission([TIE, 2]));
    const error = await rejected(service.submit(chika, submission([TIE, 1])));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      stockCountWaitingMessage('CNT-2026-0001')
    );
  });

  it('answers the same 409 when another count wins the race to the index', async () => {
    const { repo, service } = setup();
    await service.submit(chika, submission([TIE, 2]));
    repo.lostRaces = 1;
    const error = await rejected(service.submit(chika, submission([SHIRT, 3])));
    expect((error as ConflictException).message).toBe(
      stockCountWaitingMessage('CNT-2026-0001')
    );
  });

  it('submits again when the count that won the race is already decided', async () => {
    const { repo, service } = setup();
    repo.lostRaces = 1;
    const count = await service.submit(chika, submission([TIE, 2]));
    expect(count).toMatchObject({
      number: 'CNT-2026-0001',
      status: 'submitted',
    });
    expect(repo.stored).toHaveLength(1);
  });

  it('answers a clash message when the race is lost again with nothing waiting', async () => {
    const { repo, service } = setup();
    repo.lostRaces = 2;
    const error = await rejected(service.submit(chika, submission([TIE, 2])));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      STOCK_COUNT_CLASH_MESSAGE
    );
    expect(repo.stored).toEqual([]);
  });

  it('answers 404 for a campus out of scope and for an unknown item', async () => {
    const { service } = setup();
    const campus = await rejected(
      service.submit(chika, { ...submission([TIE, 1]), campusId: 'abuja' })
    );
    expect(campus).toBeInstanceOf(NotFoundException);
    expect((campus as NotFoundException).message).toBe(
      STORE_CAMPUS_NOT_FOUND_MESSAGE
    );
    const unknown = await rejected(
      service.submit(chika, submission(['other-school-item', 1]))
    );
    expect(unknown).toBeInstanceOf(NotFoundException);
    expect((unknown as NotFoundException).message).toBe(ITEM_NOT_FOUND_MESSAGE);
  });

  it('answers 400 for a retired item', async () => {
    const { repo, service } = setup();
    repo.seedItem(item({ id: TIE, retiredAt: '2026-10-01T00:00:00.000Z' }));
    const error = await rejected(service.submit(chika, submission([TIE, 1])));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      stockCountRetiredItemMessage('School tie')
    );
  });
});

describe('StockCountService.approve', () => {
  it('answers 409 SelfApproval for the counter and writes nothing', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    const error = await rejected(service.approve(chika, count.id));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(repo.movements).toEqual([]);
    expect(repo.posted).toEqual([]);
  });

  it('answers 404 for a count that is not in scope', async () => {
    const { service } = setup();
    expect(await rejected(service.approve(grace, 'nope'))).toBeInstanceOf(
      NotFoundException
    );
  });

  it('moves one tie out at its average and posts Dr 5300 / Cr 1300', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    const approved = await service.approve(grace, count.id);
    expect(approved).toMatchObject({
      status: 'approved',
      decidedBy: { id: 'grace' },
    });
    expect(repo.lockedItems.at(-1)).toEqual([TIE]);
    expect(repo.movements).toEqual([
      { itemId: TIE, quantity: -1, valueMinor: -116_667, number: count.number },
    ]);
    expect(repo.posted).toHaveLength(1);
    expect(repo.posted[0]).toMatchObject({
      kind: 'store_count',
      reference: 'CNT-2026-0001',
      effectiveOn: '2026-10-17',
      postedBy: 'grace',
      sourceId: count.id,
      lines: [
        { ledgerAccountId: 'store-losses', debitMinor: 116_667 },
        { ledgerAccountId: 'store-stock', creditMinor: 116_667 },
      ],
    });
  });

  it('adds one shirt at ₦3,250 and posts Dr 1300 / Cr 5300', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([SHIRT, 5]));
    await service.approve(grace, count.id);
    expect(repo.movements).toEqual([
      { itemId: SHIRT, quantity: 1, valueMinor: 325_000, number: count.number },
    ]);
    expect(repo.posted[0]?.lines).toMatchObject([
      { ledgerAccountId: 'store-stock', debitMinor: 325_000 },
      { ledgerAccountId: 'store-losses', creditMinor: 325_000 },
    ]);
  });

  it('posts movements but no entry when the differences net to zero value', async () => {
    const { repo, service } = setup();
    repo.setStock(STORE, TIE, { onHand: 2, valueMinor: 300_000 });
    repo.setStock(STORE, SHIRT, { onHand: 2, valueMinor: 300_000 });
    repo.seedItem(item({ id: SHIRT, costPriceMinor: 150_000 }));
    const count = await service.submit(chika, submission([TIE, 1], [SHIRT, 3]));
    await service.approve(grace, count.id);
    expect(repo.movements).toHaveLength(2);
    expect(repo.posted).toEqual([]);
  });

  it('answers 409 AlreadyDecided on a second decision, posting once', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    await service.approve(grace, count.id);
    const error = await rejected(service.approve(as('tunde'), count.id));
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
    expect(repo.posted).toHaveLength(1);
  });

  it('answers 409 AlreadyDecided when it lost the conditional update', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    repo.approveChanges = false;
    const error = await rejected(service.approve(grace, count.id));
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'AlreadyDecided',
    });
  });

  it('answers 409 when stock has moved since the count and writes nothing', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    repo.setStock(STORE, TIE, { onHand: 0, valueMinor: 0 });
    const error = await rejected(service.approve(grace, count.id));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(STOCK_MOVED_MESSAGE);
    expect(repo.movements).toEqual([]);
    expect(repo.posted).toEqual([]);
    expect(repo.stored[0]?.status).toBe('submitted');
  });

  it('refuses to approve a matched count', async () => {
    const { service } = setup();
    const count = await service.submit(chika, submission([TIE, 3]));
    const error = await rejected(service.approve(grace, count.id));
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'AlreadyDecided',
    });
  });
});

describe('StockCountService.decline', () => {
  it('needs a reason', async () => {
    const { service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    const error = await rejected(service.decline(grace, count.id, '  '));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(DECLINE_REASON_MESSAGE);
  });

  it('keeps the count as declined and leaves stock alone', async () => {
    const { repo, service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    const declined = await service.decline(grace, count.id, ' Recount first ');
    expect(declined).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Recount first',
      decidedBy: { id: 'grace' },
    });
    expect(repo.movements).toEqual([]);
    expect(repo.posted).toEqual([]);
  });

  it('answers 409 SelfApproval for the counter, 404 out of scope and 409 once decided', async () => {
    const { service } = setup();
    const count = await service.submit(chika, submission([TIE, 2]));
    const own = await rejected(service.decline(chika, count.id, 'No'));
    expect((own as ConflictException).getResponse()).toMatchObject({
      code: 'SelfApproval',
    });
    expect(await rejected(service.decline(grace, 'nope', 'No'))).toBeInstanceOf(
      NotFoundException
    );
    await service.decline(grace, count.id, 'No');
    const again = await rejected(service.decline(grace, count.id, 'No'));
    expect((again as ConflictException).getResponse()).toMatchObject({
      code: 'AlreadyDecided',
    });
  });
});

describe('StockCountService.list and get', () => {
  it('lists counts with their total and filters by campus', async () => {
    const { service } = setup();
    await service.submit(chika, submission([TIE, 3]));
    const all = await service.list(chika, FIRST_PAGE);
    expect(all.total).toBe(1);
    expect(
      (await service.list(chika, { ...FIRST_PAGE, campusId: LEKKI })).items
    ).toHaveLength(1);
  });

  it('lists newest first and hides a campus the caller cannot see', async () => {
    const { service } = setup();
    await service.submit(chika, submission([TIE, 3]));
    await service.submit(chika, submission([TIE, 3]));
    const numbers = (await service.list(chika, FIRST_PAGE)).items.map(
      (count) => count.number
    );
    expect(numbers).toEqual(['CNT-2026-0002', 'CNT-2026-0001']);

    const ikejaOnly = { ...chika, campusScope: ['ikeja'] } as OrgContext;
    expect((await service.list(ikejaOnly, FIRST_PAGE)).items).toEqual([]);
    const [first] = (await service.list(chika, FIRST_PAGE)).items;
    expect(
      await rejected(service.get(ikejaOnly, first?.id ?? ''))
    ).toBeInstanceOf(NotFoundException);
  });

  it('pages the list and keeps the full total', async () => {
    const { service } = setup();
    for (let n = 0; n < 3; n += 1) {
      await service.submit(chika, submission([TIE, 3]));
    }
    const second = await service.list(chika, { page: 2, pageSize: 2 });
    expect(second.total).toBe(3);
    expect(second.items).toHaveLength(1);
  });

  it('answers 404 for a campus filter out of scope and for an unknown count', async () => {
    const { service } = setup();
    expect(
      await rejected(service.list(chika, { ...FIRST_PAGE, campusId: 'abuja' }))
    ).toBeInstanceOf(NotFoundException);
    expect(await rejected(service.get(chika, 'nope'))).toBeInstanceOf(
      NotFoundException
    );
  });

  it('gets one count by id', async () => {
    const { service } = setup();
    const made = await service.submit(chika, submission([TIE, 2]));
    expect((await service.get(grace, made.id)).number).toBe('CNT-2026-0001');
  });
});
