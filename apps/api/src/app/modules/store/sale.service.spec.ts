import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ITEM_NOT_FOUND_MESSAGE,
  MONEY_ACCOUNT_NOT_FOUND_MESSAGE,
  PAYMENT_METHOD_OFF_MESSAGE,
  PAYMENT_PROOF_NOT_FOUND_MESSAGE,
  PAYMENT_PROOF_TAKEN_MESSAGE,
  PAYMENT_STUDENT_NOT_FOUND_MESSAGE,
  STORE_SALE_ACCOUNT_CHOICE_MESSAGE,
  STORE_SALE_NOT_ACTIVE_MESSAGE,
  STORE_SALE_NO_TERM_MESSAGE,
  STORE_SALE_POS_PROOF_MESSAGE,
  STORE_SALE_REFERENCE_TAKEN_MESSAGE,
  STORE_SALE_TRANSFER_PROOF_MESSAGE,
  STORE_SALE_ZERO_PRICE_MESSAGE,
  deliveryRetiredItemMessage,
  storeSaleNoAccountMessage,
  storeSaleReferenceUsedMessage,
  storeSaleStockShortMessage,
  type RecordSale,
  type Sale,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import {
  FakeSaleRepository,
  saleAccount,
  saleStudent,
} from './fake-sale.repository';
import {
  FakeStoreRepository,
  storeItem,
  storeRef,
} from './fake-store.repository';
import { saleRequestHash } from './sale-request-hash';
import { SaleService } from './sale.service';

const ctx = (campusScope: 'all' | string[] = 'all') =>
  ({
    organizationId: 'school-a',
    user: { id: 'chika', email: 'chika@eduvault.test', name: 'Chika' },
    campusScope,
  }) as unknown as OrgContext;

const shirt = storeItem();
const tie = storeItem({ name: 'Tie', variant: null });

const body: RecordSale = {
  reference: 'STORE-20261007-1A2B3C4D',
  studentId: 'ada',
  method: 'cash',
  moneyAccountId: undefined,
  proofFileId: undefined,
  lines: [
    { itemId: shirt.id, quantity: 2 },
    { itemId: tie.id, quantity: 1 },
  ],
};

function setup() {
  const store = new FakeStoreRepository();
  store.stores = [storeRef('lekki', 'Lekki'), storeRef('ikeja', 'Ikeja')];
  store.items = [shirt, tie];
  const sales = new FakeSaleRepository();
  sales.students.set('ada', saleStudent());
  sales.accountRows = [saleAccount()];
  const clock = new Clock();
  clock.set('2026-10-07');
  return { store, sales, service: new SaleService(sales, store, clock) };
}

const storedSale = (overrides: Partial<Sale> = {}): Sale => ({
  id: 'sale-1',
  number: 'ISS-2026-0001',
  reference: body.reference,
  soldOn: '2026-10-07',
  student: {
    id: 'ada',
    name: 'Ada Obi',
    admissionNumber: 'GF-0123',
    className: 'JSS 2 Gold',
  },
  campusId: 'lekki',
  campusName: 'Lekki',
  soldBy: 'Chika',
  lines: [],
  totalMinor: 1_350_000,
  costMinor: 1_000_000,
  chargeId: 'invoice-1',
  chargeNumber: 'CHG-2026-00001',
  paymentId: 'payment-1',
  receiptNumber: 'RCT-2026-00001',
  method: 'cash',
  proof: null,
  ...overrides,
});

const existing = (moneyAccountId = 'cash-box') => ({
  id: 'sale-1',
  number: 'ISS-2026-0001',
  moneyAccountId,
  requestHash: saleRequestHash({
    studentId: 'ada',
    method: 'cash',
    moneyAccountId,
    lines: body.lines,
  }),
});

describe('SaleService.record', () => {
  it('records the sale at the item prices and returns it', async () => {
    const { sales, service } = setup();
    sales.stored.set('sale-1', storedSale());

    const recorded = await service.record(ctx(), body);

    expect(recorded).toMatchObject({ id: 'sale-1', replayed: false });
    expect(sales.inserted).toHaveLength(1);
    expect(sales.inserted[0]).toMatchObject({
      organizationId: 'school-a',
      userId: 'chika',
      userName: 'Chika',
      year: 2026,
      today: '2026-10-07',
      reference: body.reference,
      termId: 'term-1',
      method: 'cash',
      proofFileId: null,
      account: { id: 'cash-box' },
      store: { campusId: 'lekki' },
      lines: [
        {
          itemId: shirt.id,
          displayName: 'School shirt, Size 12',
          quantity: 2,
          unitPriceMinor: 450_000,
        },
        { itemId: tie.id, displayName: 'Tie', quantity: 1 },
      ],
    });
    expect(sales.inserted[0]?.requestHash).toBe(
      saleRequestHash({
        studentId: 'ada',
        method: 'cash',
        moneyAccountId: 'cash-box',
        lines: body.lines,
      })
    );
  });

  describe('validation order', () => {
    it('answers 404 for a student outside the campus scope or school', async () => {
      const { sales, service } = setup();
      sales.students.clear();
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new NotFoundException(PAYMENT_STUDENT_NOT_FOUND_MESSAGE)
      );
      expect(sales.inserted).toEqual([]);
    });

    it.each(['inactive', 'left', 'graduated'] as const)(
      'answers 409 for a %s student',
      async (life) => {
        const { sales, service } = setup();
        sales.students.set('ada', saleStudent({ life }));
        await expect(service.record(ctx(), body)).rejects.toThrow(
          new ConflictException(STORE_SALE_NOT_ACTIVE_MESSAGE)
        );
      }
    );

    it('answers 409 with no current term', async () => {
      const { sales, service } = setup();
      sales.term = undefined;
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new ConflictException(STORE_SALE_NO_TERM_MESSAGE)
      );
    });

    it('answers 400 for a method the school switched off', async () => {
      const { sales, service } = setup();
      sales.methods = { cash: false, transfer: true, pos: true };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new BadRequestException(PAYMENT_METHOD_OFF_MESSAGE)
      );
    });

    it('checks the student before the term and the term before the method', async () => {
      const { sales, service } = setup();
      sales.students.set('ada', saleStudent({ life: 'left' }));
      sales.term = undefined;
      sales.methods = { cash: false, transfer: false, pos: false };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        STORE_SALE_NOT_ACTIVE_MESSAGE
      );
      sales.students.set('ada', saleStudent());
      await expect(service.record(ctx(), body)).rejects.toThrow(
        STORE_SALE_NO_TERM_MESSAGE
      );
      sales.term = { id: 'term-1', name: 'First term' };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        PAYMENT_METHOD_OFF_MESSAGE
      );
    });
  });

  describe('proof', () => {
    const pos: RecordSale = { ...body, method: 'pos' };

    it('asks for the POS slip and the transfer receipt by name', async () => {
      const { sales, service } = setup();
      sales.accountRows = [
        saleAccount({ id: 'pos-1', kind: 'pos' }),
        saleAccount({ id: 'bank-1', kind: 'bank' }),
      ];
      await expect(service.record(ctx(), pos)).rejects.toThrow(
        new BadRequestException(STORE_SALE_POS_PROOF_MESSAGE)
      );
      await expect(
        service.record(ctx(), { ...body, method: 'transfer' })
      ).rejects.toThrow(
        new BadRequestException(STORE_SALE_TRANSFER_PROOF_MESSAGE)
      );
    });

    it('answers 404 for a proof that is not the caller’s and 409 for one in use', async () => {
      const { sales, service } = setup();
      sales.accountRows = [saleAccount({ kind: 'pos' })];
      const withProof = { ...pos, proofFileId: 'slip' };
      await expect(service.record(ctx(), withProof)).rejects.toThrow(
        new NotFoundException(PAYMENT_PROOF_NOT_FOUND_MESSAGE)
      );
      sales.proofs.set('slip', 'taken');
      await expect(service.record(ctx(), withProof)).rejects.toThrow(
        new ConflictException(PAYMENT_PROOF_TAKEN_MESSAGE)
      );
    });

    it('passes a free proof on to the sale', async () => {
      const { sales, service } = setup();
      sales.accountRows = [saleAccount({ kind: 'pos' })];
      sales.proofs.set('slip', 'free');
      sales.stored.set('sale-1', storedSale());
      await service.record(ctx(), { ...pos, proofFileId: 'slip' });
      expect(sales.inserted[0]?.proofFileId).toBe('slip');
    });
  });

  describe('items', () => {
    it('answers 404 for an item that is not in the school', async () => {
      const { store, service } = setup();
      store.items = [shirt];
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new NotFoundException(ITEM_NOT_FOUND_MESSAGE)
      );
    });

    it('answers 400 for a retired item, by name', async () => {
      const { store, service } = setup();
      store.items = [shirt, { ...tie, retiredAt: '2026-09-01T00:00:00.000Z' }];
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new BadRequestException(deliveryRetiredItemMessage('Tie'))
      );
    });

    it('answers 400 for an item with no selling price', async () => {
      const { store, service } = setup();
      store.items = [shirt, { ...tie, sellPriceMinor: 0 }];
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new BadRequestException(STORE_SALE_ZERO_PRICE_MESSAGE)
      );
    });
  });

  describe('Into account', () => {
    it('picks the only fitting account', async () => {
      const { sales, service } = setup();
      sales.accountRows = [
        saleAccount({ id: 'pos-1', kind: 'pos' }),
        saleAccount({ id: 'cash-1', kind: 'cash' }),
      ];
      sales.stored.set('sale-1', storedSale());
      await service.record(ctx(), body);
      expect(sales.inserted[0]?.account.id).toBe('cash-1');
    });

    it('answers 400 when several fit and none is named', async () => {
      const { sales, service } = setup();
      sales.accountRows = [
        saleAccount({ id: 'cash-1', kind: 'cash' }),
        saleAccount({ id: 'bank-1', kind: 'bank' }),
      ];
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new BadRequestException(STORE_SALE_ACCOUNT_CHOICE_MESSAGE)
      );
    });

    it('takes the named account when several fit', async () => {
      const { sales, service } = setup();
      sales.accountRows = [
        saleAccount({ id: 'cash-1', kind: 'cash' }),
        saleAccount({ id: 'bank-1', kind: 'bank' }),
      ];
      sales.stored.set('sale-1', storedSale());
      await service.record(ctx(), { ...body, moneyAccountId: 'bank-1' });
      expect(sales.inserted[0]?.account.id).toBe('bank-1');
    });

    it('answers 400 with the campus named when none fits', async () => {
      const { sales, service } = setup();
      sales.accountRows = [saleAccount({ kind: 'bank', campusId: 'ikeja' })];
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new BadRequestException(storeSaleNoAccountMessage('cash', 'Lekki'))
      );
    });

    it('answers 404 for an account outside the scope and 400 for one that does not fit', async () => {
      const { sales, service } = setup();
      sales.accountRows = [
        saleAccount({ id: 'cash-1', kind: 'cash' }),
        saleAccount({ id: 'old', kind: 'cash', retired: true }),
        saleAccount({ id: 'pos-1', kind: 'pos' }),
      ];
      await expect(
        service.record(ctx(), { ...body, moneyAccountId: 'elsewhere' })
      ).rejects.toThrow(new NotFoundException(MONEY_ACCOUNT_NOT_FOUND_MESSAGE));
      for (const id of ['old', 'pos-1']) {
        await expect(
          service.record(ctx(), { ...body, moneyAccountId: id })
        ).rejects.toThrow(
          new BadRequestException(storeSaleNoAccountMessage('cash', 'Lekki'))
        );
      }
    });
  });

  describe('outcomes', () => {
    it('answers 409 with the shelf and campus when stock is short', async () => {
      const { sales, service } = setup();
      sales.outcome = { status: 'stock_short', itemName: 'Tie', onHand: 0 };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new ConflictException(storeSaleStockShortMessage(0, 'Tie', 'Lekki'))
      );
    });

    it('answers 409 when the reference clashes inside the transaction', async () => {
      const { sales, service } = setup();
      sales.outcome = { status: 'posting_clash' };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new ConflictException(STORE_SALE_REFERENCE_TAKEN_MESSAGE)
      );
    });

    it('answers 409 when a racing request used the reference with another body', async () => {
      const { sales, service } = setup();
      sales.outcome = { status: 'reference_used', number: 'ISS-2026-0001' };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new ConflictException(
          storeSaleReferenceUsedMessage(body.reference, 'ISS-2026-0001')
        )
      );
    });

    it('answers 409 when the proof was taken by a racing request', async () => {
      const { sales, service } = setup();
      sales.outcome = { status: 'proof_taken' };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new ConflictException(PAYMENT_PROOF_TAKEN_MESSAGE)
      );
    });

    it('answers 409 when the student or the term changed before the transaction', async () => {
      const { sales, service } = setup();
      sales.outcome = { status: 'student_not_active' };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new ConflictException(STORE_SALE_NOT_ACTIVE_MESSAGE)
      );
      sales.outcome = { status: 'no_term' };
      await expect(service.record(ctx(), body)).rejects.toThrow(
        new ConflictException(STORE_SALE_NO_TERM_MESSAGE)
      );
    });

    it('returns a racing replay as replayed', async () => {
      const { sales, service } = setup();
      sales.outcome = { status: 'replayed', id: 'sale-1' };
      sales.stored.set('sale-1', storedSale());
      await expect(service.record(ctx(), body)).resolves.toMatchObject({
        replayed: true,
      });
    });
  });

  describe('replay', () => {
    it('returns the earlier sale and writes nothing, even with the method since switched off', async () => {
      const { sales, service } = setup();
      sales.existing = existing();
      sales.stored.set('sale-1', storedSale());
      sales.methods = { cash: false, transfer: true, pos: true };

      const replayed = await service.record(ctx(), body);

      expect(replayed).toMatchObject({
        replayed: true,
        receiptNumber: 'RCT-2026-00001',
      });
      expect(sales.inserted).toEqual([]);
    });

    it('answers 409 for the same reference with other lines or another student', async () => {
      const { sales, service } = setup();
      sales.existing = existing();
      sales.stored.set('sale-1', storedSale());
      const message = storeSaleReferenceUsedMessage(
        body.reference,
        'ISS-2026-0001'
      );
      await expect(
        service.record(ctx(), {
          ...body,
          lines: [{ itemId: shirt.id, quantity: 3 }],
        })
      ).rejects.toThrow(new ConflictException(message));
      await expect(
        service.record(ctx(), { ...body, studentId: 'chidi' })
      ).rejects.toThrow(new ConflictException(message));
    });

    it('answers 409 for a different account named on the retry', async () => {
      const { sales, service } = setup();
      sales.existing = existing();
      sales.stored.set('sale-1', storedSale());
      await expect(
        service.record(ctx(), { ...body, moneyAccountId: 'bank-1' })
      ).rejects.toThrow(
        new ConflictException(
          storeSaleReferenceUsedMessage(body.reference, 'ISS-2026-0001')
        )
      );
    });

    it('accepts the retry naming the account the first try chose', async () => {
      const { sales, service } = setup();
      sales.existing = existing();
      sales.stored.set('sale-1', storedSale());
      await expect(
        service.record(ctx(), { ...body, moneyAccountId: 'cash-box' })
      ).resolves.toMatchObject({ replayed: true });
    });

    it('answers the generic 409 when the earlier sale cannot be seen', async () => {
      const { sales, service } = setup();
      sales.existing = existing();
      await expect(service.record(ctx(['ikeja']), body)).rejects.toThrow(
        new ConflictException(STORE_SALE_REFERENCE_TAKEN_MESSAGE)
      );
    });
  });
});
