import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  FEE_TYPE_NOT_FOUND_MESSAGE,
  INVOICE_NO_TERM_MESSAGE,
  INVOICE_REFERENCE_TAKEN_MESSAGE,
  INVOICE_STUDENT_NOT_FOUND_MESSAGE,
  INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE,
  invoiceReferenceUsedMessage,
  type CreateOneOffCharge,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { chargeRequestHash } from '../../common/fees';
import {
  chargeableStudent,
  FakeInvoiceWriteRepository,
} from './fake-invoice-write.repository';
import type { InvoiceRecord, InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';

const ctx = (campusScope: 'all' | string[] = 'all') =>
  ({
    organizationId: 'school-a',
    user: { id: 'bursar', email: 'bursar@eduvault.test', name: 'Bursar' },
    campusScope,
  }) as unknown as OrgContext;

const trips = 'fee-trips';
const cards = 'fee-cards';

const body: CreateOneOffCharge = {
  studentId: 'ada',
  reference: 'ONEOFF-20261018-1A2B3C4D',
  lines: [
    { feeTypeId: trips, description: 'School trip', amountMinor: 1_500_000 },
    { feeTypeId: cards, description: 'ID card', amountMinor: 250_000 },
  ],
};

const record: InvoiceRecord = {
  id: 'invoice-1',
  number: 'CHG-2026-0001',
  kind: 'adhoc',
  status: 'issued',
  student: {
    id: 'ada',
    name: 'Ada Obi',
    admissionNumber: 'ADM-1',
    armName: null,
  },
  termId: 'term-1',
  termName: 'First term, 2026/2027',
  campusId: 'lekki',
  campusName: 'Lekki',
  lines: [],
  totalMinor: 1_750_000,
  billingRun: null,
  createdAt: '2026-10-18T10:00:00.000+01:00',
  issuedAt: '2026-10-18T10:00:00.000+01:00',
  issuedBy: 'Bursar',
  chargedTo: null,
  journal: null,
  source: null,
  entrySequence: 5,
};

function setup() {
  const writes = new FakeInvoiceWriteRepository();
  writes.students.set('ada', chargeableStudent());
  writes.feeTypeIds = new Set([trips, cards]);
  const reads = {
    find: vi.fn(() => Promise.resolve(record)),
    currency: vi.fn(() => Promise.resolve('NGN')),
    movements: vi.fn(() => Promise.resolve([])),
  } as unknown as InvoiceRepository;
  const clock = new Clock();
  clock.set('2026-10-18');
  return { writes, service: new InvoiceService(reads, writes, clock) };
}

describe('InvoiceService.create', () => {
  it('creates the charge for the current term and returns it with replayed false', async () => {
    const { writes, service } = setup();
    const created = await service.create(ctx(), body);
    expect(created).toMatchObject({
      id: 'invoice-1',
      number: 'CHG-2026-0001',
      replayed: false,
    });
    expect(writes.created).toEqual([
      {
        organizationId: 'school-a',
        userId: 'bursar',
        userName: 'Bursar',
        year: 2026,
        today: '2026-10-18',
        reference: body.reference,
        requestHash: chargeRequestHash(body),
        studentId: 'ada',
        campusScope: 'all',
        termId: 'term-1',
        lines: body.lines,
      },
    ]);
  });

  it('hands the caller’s campuses to the transaction', async () => {
    const { writes, service } = setup();
    await service.create(ctx(['lekki']), body);
    expect(writes.created[0]?.campusScope).toEqual(['lekki']);
  });

  it('answers 404 for a student out of scope', async () => {
    const { writes, service } = setup();
    writes.students.clear();
    const attempt = service.create(ctx(), body);
    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    await expect(attempt).rejects.toHaveProperty(
      'message',
      INVOICE_STUDENT_NOT_FOUND_MESSAGE
    );
    expect(writes.created).toHaveLength(0);
  });

  it('answers 409 for a student off the roll', async () => {
    const { writes, service } = setup();
    writes.students.set('ada', chargeableStudent({ onRoll: false }));
    const attempt = service.create(ctx(), body);
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toHaveProperty(
      'message',
      INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE
    );
  });

  it('answers 404 for an unknown or retired fee type', async () => {
    const { writes, service } = setup();
    writes.feeTypeIds = new Set([trips]);
    const attempt = service.create(ctx(), body);
    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    await expect(attempt).rejects.toHaveProperty(
      'message',
      FEE_TYPE_NOT_FOUND_MESSAGE
    );
    expect(writes.created).toHaveLength(0);
  });

  it('accepts two lines on one fee type', async () => {
    const { writes, service } = setup();
    writes.feeTypeIds = new Set([trips]);
    const [first] = body.lines;
    const twice = { ...body, lines: [first, first] } as CreateOneOffCharge;
    await expect(service.create(ctx(), twice)).resolves.toBeDefined();
  });

  it('answers 409 with no current term', async () => {
    const { writes, service } = setup();
    writes.term = undefined;
    const attempt = service.create(ctx(), body);
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toHaveProperty(
      'message',
      INVOICE_NO_TERM_MESSAGE
    );
  });

  describe('a known reference', () => {
    const existing = {
      id: 'invoice-1',
      number: 'CHG-2026-0001',
      campusId: 'lekki',
    };

    it('replays the charge for the same body without posting again', async () => {
      const { writes, service } = setup();
      writes.existing = { ...existing, requestHash: chargeRequestHash(body) };
      const replayed = await service.create(ctx(), body);
      expect(replayed).toMatchObject({ id: 'invoice-1', replayed: true });
      expect(writes.created).toHaveLength(0);
    });

    it('answers 409 naming the number for another body', async () => {
      const { writes, service } = setup();
      writes.existing = { ...existing, requestHash: 'another-body' };
      const attempt = service.create(ctx(), body);
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toHaveProperty(
        'message',
        invoiceReferenceUsedMessage(body.reference, 'CHG-2026-0001')
      );
    });

    it('answers 409 without the number when the charge is out of scope', async () => {
      const { writes, service } = setup();
      writes.existing = { ...existing, requestHash: chargeRequestHash(body) };
      const attempt = service.create(ctx(['ikeja']), body);
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toHaveProperty(
        'message',
        INVOICE_REFERENCE_TAKEN_MESSAGE
      );
    });
  });

  describe('the outcome of the transaction', () => {
    it('answers 404 for a fee type retired meanwhile', async () => {
      const { writes, service } = setup();
      writes.outcome = { status: 'fee_type_not_found' };
      const attempt = service.create(ctx(), body);
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
      await expect(attempt).rejects.toHaveProperty(
        'message',
        FEE_TYPE_NOT_FOUND_MESSAGE
      );
    });

    it('answers 404 for a student that left the caller’s campuses meanwhile', async () => {
      const { writes, service } = setup();
      writes.outcome = { status: 'student_not_found' };
      const attempt = service.create(ctx(), body);
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
      await expect(attempt).rejects.toHaveProperty(
        'message',
        INVOICE_STUDENT_NOT_FOUND_MESSAGE
      );
    });

    it('returns the charge for a replay inside it', async () => {
      const { writes, service } = setup();
      writes.outcome = { status: 'replayed', id: 'invoice-1' };
      await expect(service.create(ctx(), body)).resolves.toMatchObject({
        replayed: true,
      });
    });

    it.each([
      [
        'reference_used',
        { status: 'reference_used', number: 'CHG-2026-0009' } as const,
        invoiceReferenceUsedMessage(body.reference, 'CHG-2026-0009'),
      ],
      [
        'reference_taken',
        { status: 'reference_taken' } as const,
        INVOICE_REFERENCE_TAKEN_MESSAGE,
      ],
      [
        'student_gone',
        { status: 'student_gone' } as const,
        INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE,
      ],
      ['no_term', { status: 'no_term' } as const, INVOICE_NO_TERM_MESSAGE],
    ])('answers 409 for %s', async (_name, outcome, message) => {
      const { writes, service } = setup();
      writes.outcome = outcome;
      const attempt = service.create(ctx(), body);
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toHaveProperty('message', message);
    });
  });
});
