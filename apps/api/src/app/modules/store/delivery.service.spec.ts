import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DELIVERY_ACCOUNT_MESSAGE,
  DELIVERY_DUPLICATE_ITEM_MESSAGE,
  DELIVERY_FUTURE_DATE_MESSAGE,
  DELIVERY_OPENING_ACCOUNT_MESSAGE,
  DELIVERY_REFERENCE_TAKEN_MESSAGE,
  DELIVERY_REQUIRED_MESSAGE,
  deliveryReferenceUsedMessage,
  deliveryRetiredItemMessage,
  openingStockRecordedMessage,
  type DeliveryDetail,
  type RecordDelivery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { deliveryRequestHash } from './delivery-request-hash';
import { DeliveryService } from './delivery.service';
import {
  FakeStoreRepository,
  storeItem,
  storeRef,
} from './fake-store.repository';

const LEKKI = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const IKEJA = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const ACCOUNT = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';

const ctx = (campusScope: 'all' | string[] = 'all') =>
  ({
    organizationId: 'school-a',
    user: { id: 'chika', email: 'chika@eduvault.test', name: 'Chika' },
    campusScope,
  }) as unknown as OrgContext;

const shirt = storeItem();
const tie = storeItem({ name: 'Tie', variant: null });

const body: RecordDelivery = {
  reference: 'DEL-REQ-20261007-1a2b3c4d',
  campusId: LEKKI,
  supplierName: 'Adebayo Uniforms Ltd',
  moneyAccountId: ACCOUNT,
  isOpening: undefined,
  receivedOn: undefined,
  lines: [
    { itemId: shirt.id, quantity: 10, unitCostMinor: 350_000 },
    { itemId: tie.id, quantity: 4, unitCostMinor: 120_000 },
  ],
};

const opening: RecordDelivery = {
  ...body,
  moneyAccountId: undefined,
  isOpening: true,
  supplierName: 'Opening stock count',
};

const stored = (id = 'delivery-1'): DeliveryDetail => ({
  id,
  number: 'DEL-2026-0001',
  reference: body.reference,
  campusId: LEKKI,
  supplierName: body.supplierName,
  moneyAccount: { id: ACCOUNT, name: 'GTBank current' },
  isOpening: false,
  receivedOn: '2026-10-07',
  receivedBy: 'Chika',
  totalMinor: 3_980_000,
  itemCount: 2,
  lines: [],
});

function setup() {
  const repository = new FakeStoreRepository();
  repository.stores = [
    storeRef('lekki', 'Lekki', LEKKI),
    storeRef('ikeja', 'Ikeja', IKEJA),
  ];
  repository.items = [shirt, tie];
  repository.accounts.set(ACCOUNT, {
    status: 'ok',
    ledgerAccountId: 'bank-ledger',
    campusId: LEKKI,
  });
  repository.deliveries = [stored()];
  const clock = new Clock({ NODE_ENV: 'test' });
  clock.set('2026-10-07');
  return { repository, service: new DeliveryService(repository, clock) };
}

const refused = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be refused');
};

describe('DeliveryService.record', () => {
  it('records a delivery on the campus store, dated today, paid from the account ledger', async () => {
    const { repository, service } = setup();

    const result = await service.record(ctx(), body);

    expect(result).toMatchObject({ replayed: false, id: 'delivery-1' });
    expect(repository.inserted).toHaveLength(1);
    expect(repository.inserted[0]).toMatchObject({
      organizationId: 'school-a',
      userId: 'chika',
      year: 2026,
      reference: body.reference,
      requestHash: deliveryRequestHash(body),
      store: { id: 'store-lekki', campusId: LEKKI },
      supplierName: 'Adebayo Uniforms Ltd',
      isOpening: false,
      receivedOn: '2026-10-07',
      moneyAccount: { id: ACCOUNT, ledgerAccountId: 'bank-ledger' },
      lines: body.lines,
    });
  });

  it('keeps a given received date, today included', async () => {
    const { repository, service } = setup();

    await service.record(ctx(), { ...body, receivedOn: '2026-10-01' });

    expect(repository.inserted[0]?.receivedOn).toBe('2026-10-01');
  });

  it('records opening stock with no money account', async () => {
    const { repository, service } = setup();

    await service.record(ctx(), opening);

    expect(repository.inserted[0]).toMatchObject({
      isOpening: true,
      moneyAccount: null,
      supplierName: 'Opening stock count',
    });
  });

  it('takes an account that is school-wide', async () => {
    const { repository, service } = setup();
    repository.accounts.set(ACCOUNT, {
      status: 'ok',
      ledgerAccountId: 'bank-ledger',
      campusId: null,
    });

    await expect(service.record(ctx(), body)).resolves.toMatchObject({
      replayed: false,
    });
  });

  it('reports a race that another request won as a replay', async () => {
    const { repository, service } = setup();
    repository.outcome = { status: 'replayed', id: 'delivery-1' };

    await expect(service.record(ctx(), body)).resolves.toMatchObject({
      replayed: true,
    });
  });

  it('answers 409 when the reference was used for another body in a race', async () => {
    const { repository, service } = setup();
    repository.outcome = { status: 'reference_used', number: 'DEL-2026-0009' };

    expect(await refused(service.record(ctx(), body))).toEqual(
      new ConflictException(
        deliveryReferenceUsedMessage(body.reference, 'DEL-2026-0009')
      )
    );
  });

  it('answers 409 naming the campus when the opening-stock unique index fires', async () => {
    const { repository, service } = setup();
    repository.outcome = { status: 'opening_exists' };

    expect(await refused(service.record(ctx(), opening))).toEqual(
      new ConflictException(openingStockRecordedMessage('Lekki'))
    );
  });
});

describe('DeliveryService.record activity', () => {
  it('writes one delivery row on the store campus for a recorded delivery', async () => {
    const { repository, service } = setup();

    await service.record(ctx(), body);

    expect(repository.activity).toEqual([
      {
        organizationId: 'school-a',
        campusId: LEKKI,
        pillar: 'finance',
        kind: 'store_delivery.received',
        actorUserId: 'chika',
        subjectType: 'stock_delivery',
        subjectId: 'delivery-1',
        text: 'Chika received delivery DEL-2026-0001 from Adebayo Uniforms Ltd at the Lekki store: 2 items, ₦39,800.',
        data: {
          deliveryId: 'delivery-1',
          number: 'DEL-2026-0001',
          storeId: 'store-lekki',
          supplierName: 'Adebayo Uniforms Ltd',
          items: 2,
          totalMinor: 3_980_000,
        },
      },
    ]);
  });

  it('writes one opening-stock row on the store campus for recorded opening stock', async () => {
    const { repository, service } = setup();

    await service.record(ctx(), opening);

    expect(repository.activity).toHaveLength(1);
    expect(repository.activity[0]).toMatchObject({
      campusId: LEKKI,
      pillar: 'finance',
      kind: 'store_opening_stock.recorded',
      subjectType: 'stock_delivery',
      text: 'Chika recorded opening stock at the Lekki store: 2 items, ₦39,800.',
    });
  });

  it.each([
    ['replayed', { status: 'replayed', id: 'delivery-1' }],
    ['reference_used', { status: 'reference_used', number: 'DEL-2026-0009' }],
    ['opening_exists', { status: 'opening_exists' }],
  ] as const)(
    'writes none when the repository answers %s',
    async (_name, outcome) => {
      const { repository, service } = setup();
      repository.outcome = outcome;

      await service.record(ctx(), body).catch(() => undefined);
      await service.record(ctx(), opening).catch(() => undefined);

      expect(repository.inserted).toHaveLength(2);
      expect(repository.activity).toHaveLength(0);
    }
  );

  it('writes none on the early replay path', async () => {
    const { repository, service } = setup();
    repository.existing = {
      id: 'delivery-1',
      number: 'DEL-2026-0001',
      requestHash: deliveryRequestHash(body),
    };

    await service.record(ctx(), body);

    expect(repository.activity).toHaveLength(0);
  });

  it('writes none when a second opening stock is refused before the insert', async () => {
    const { repository, service } = setup();
    repository.opening = true;

    await service.record(ctx(), opening).catch(() => undefined);

    expect(repository.activity).toHaveLength(0);
  });

  it.each<[string, RecordDelivery]>([
    ['a future date', { ...body, receivedOn: '2026-10-08' }],
    ['no lines', { ...body, lines: [] }],
    ['no money account', { ...body, moneyAccountId: undefined }],
    ['an unknown account', { ...body, moneyAccountId: IKEJA }],
    [
      'an unknown item',
      {
        ...body,
        lines: [{ itemId: IKEJA, quantity: 1, unitCostMinor: 100 }],
      },
    ],
    ['a campus out of scope', { ...body, campusId: IKEJA }],
  ])('writes none for %s', async (_name, input) => {
    const { repository, service } = setup();

    await refused(service.record(ctx([LEKKI]), input));

    expect(repository.activity).toHaveLength(0);
  });
});

describe('DeliveryService.record replay', () => {
  it('returns the earlier delivery and inserts nothing for an identical request', async () => {
    const { repository, service } = setup();
    repository.existing = {
      id: 'delivery-1',
      number: 'DEL-2026-0001',
      requestHash: deliveryRequestHash(body),
    };

    const result = await service.record(ctx(), {
      ...body,
      lines: body.lines.toReversed(),
    });

    expect(result).toMatchObject({ replayed: true, number: 'DEL-2026-0001' });
    expect(repository.inserted).toHaveLength(0);
  });

  it('answers 409 naming the delivery when the reference carries a different body', async () => {
    const { repository, service } = setup();
    repository.existing = {
      id: 'delivery-1',
      number: 'DEL-2026-0001',
      requestHash: deliveryRequestHash(body),
    };

    expect(
      await refused(
        service.record(ctx(), { ...body, supplierName: 'Someone else' })
      )
    ).toEqual(
      new ConflictException(
        deliveryReferenceUsedMessage(body.reference, 'DEL-2026-0001')
      )
    );
    expect(repository.inserted).toHaveLength(0);
  });

  it('answers a bare 409 when the earlier delivery cannot be seen', async () => {
    const { repository, service } = setup();
    repository.existing = {
      id: 'elsewhere',
      number: 'DEL-2026-0001',
      requestHash: deliveryRequestHash(body),
    };

    expect(await refused(service.record(ctx(), body))).toEqual(
      new ConflictException(DELIVERY_REFERENCE_TAKEN_MESSAGE)
    );
  });
});

describe('DeliveryService.record refusals', () => {
  it('answers 400 for a received date in the future', async () => {
    const { repository, service } = setup();

    expect(
      await refused(
        service.record(ctx(), { ...body, receivedOn: '2026-10-08' })
      )
    ).toEqual(new BadRequestException(DELIVERY_FUTURE_DATE_MESSAGE));
    expect(repository.inserted).toHaveLength(0);
  });

  it('answers 404 for a campus outside the caller’s scope', async () => {
    const { repository, service } = setup();

    expect(
      await refused(service.record(ctx([LEKKI]), { ...body, campusId: IKEJA }))
    ).toEqual(new NotFoundException('Campus not found'));
    expect(repository.inserted).toHaveLength(0);
  });

  it('answers 400 for no lines', async () => {
    const { service } = setup();

    expect(
      await refused(service.record(ctx(), { ...body, lines: [] }))
    ).toEqual(new BadRequestException(DELIVERY_REQUIRED_MESSAGE));
  });

  it('answers 400 when an item is listed twice', async () => {
    const { service } = setup();

    expect(
      await refused(
        service.record(ctx(), {
          ...body,
          lines: [
            { itemId: shirt.id, quantity: 1, unitCostMinor: 100 },
            { itemId: shirt.id, quantity: 2, unitCostMinor: 100 },
          ],
        })
      )
    ).toEqual(new BadRequestException(DELIVERY_DUPLICATE_ITEM_MESSAGE));
  });

  it('answers 404 for an item that is not in the school', async () => {
    const { service } = setup();

    expect(
      await refused(
        service.record(ctx(), {
          ...body,
          lines: [{ itemId: ACCOUNT, quantity: 1, unitCostMinor: 100 }],
        })
      )
    ).toEqual(new NotFoundException('Item not found'));
  });

  it('answers 400 naming a retired item', async () => {
    const { repository, service } = setup();
    repository.items = [
      { ...shirt, retiredAt: '2026-09-01T00:00:00.000Z' },
      tie,
    ];

    expect(await refused(service.record(ctx(), body))).toEqual(
      new BadRequestException(
        deliveryRetiredItemMessage('School shirt, Size 12')
      )
    );
  });

  it('answers 400 when a delivery names no money account', async () => {
    const { service } = setup();

    expect(
      await refused(
        service.record(ctx(), { ...body, moneyAccountId: undefined })
      )
    ).toEqual(new BadRequestException(DELIVERY_ACCOUNT_MESSAGE));
  });

  it('answers 404 for a money account outside the caller’s scope', async () => {
    const { repository, service } = setup();
    repository.accounts.clear();

    expect(await refused(service.record(ctx(), body))).toEqual(
      new NotFoundException('Money account not found')
    );
  });

  it.each([
    ['a gateway', { status: 'gateway' }],
    ['a retired account', { status: 'retired' }],
    [
      'an account on another campus',
      { status: 'ok', ledgerAccountId: 'x', campusId: IKEJA },
    ],
  ] as const)('answers 400 for %s', async (_name, account) => {
    const { repository, service } = setup();
    repository.accounts.set(ACCOUNT, account);

    expect(await refused(service.record(ctx(), body))).toEqual(
      new BadRequestException(DELIVERY_ACCOUNT_MESSAGE)
    );
    expect(repository.inserted).toHaveLength(0);
  });

  it('answers 400 when opening stock names a money account', async () => {
    const { service } = setup();

    expect(
      await refused(
        service.record(ctx(), { ...opening, moneyAccountId: ACCOUNT })
      )
    ).toEqual(new BadRequestException(DELIVERY_OPENING_ACCOUNT_MESSAGE));
  });

  it('answers 409 for a second opening stock on the store', async () => {
    const { repository, service } = setup();
    repository.opening = true;

    expect(await refused(service.record(ctx(), opening))).toEqual(
      new ConflictException(openingStockRecordedMessage('Lekki'))
    );
    expect(repository.inserted).toHaveLength(0);
  });
});
