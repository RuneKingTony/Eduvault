import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  PAYMENT_VOID_EXISTS_MESSAGE,
  PAYMENT_VOID_NOT_RECORDED_MESSAGE,
  PAYMENT_VOID_OTHER_CAMPUS_MESSAGE,
  PAYMENT_VOID_REASON_MESSAGE,
  PAYMENT_VOID_STORE_SALE_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  type ApprovalStatus,
  type PaymentStatus,
  type PaymentVoidItem,
} from '@eduvault/api-contract';
import type { ActivityInput, CampusAmount } from '../../common/activity';
import type { WaitingApproval } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { LedgerLine } from '../../common/ledger';
import {
  PaymentVoidRepository,
  type PaymentVoidTx,
  type VoidPage,
  type VoidPost,
  type VoidRecord,
  type VoidablePayment,
} from './payment-void.repository';
import type { PaymentRepository } from './payment.repository';
import { PaymentVoidService } from './payment-void.service';
import type { OrgScope } from '../../common/scope';

const PAYMENT = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const as = (id: string) =>
  ({
    organizationId: 'school-a',
    user: { id, email: `${id}@eduvault.test`, name: id },
    campusScope: 'all',
  }) as unknown as OrgContext;

const chika = as('chika');
const grace = as('grace');

const original: LedgerLine[] = [
  {
    ledgerAccountId: 'cash',
    campusId: 'lekki',
    debitMinor: 2_000_000,
    creditMinor: 0,
  },
  {
    ledgerAccountId: 'receivable',
    studentId: 'ada',
    campusId: 'lekki',
    debitMinor: 0,
    creditMinor: 2_000_000,
  },
];

const receipt = (over: Partial<VoidablePayment> = {}): VoidablePayment => ({
  id: PAYMENT,
  receiptNumber: 'RCT-2026-00098',
  reference: 'CASH-20261015-A1',
  payerName: 'Mrs Danjuma',
  amountMinor: 2_000_000,
  status: 'posted',
  paidOn: '2026-10-15',
  entryId: 'entry-1',
  everyAllocationInScope: true,
  storeSale: null,
  ...over,
});

interface StoredVoid {
  id: string;
  paymentId: string;
  status: ApprovalStatus;
  reason: string;
  createdBy: string | null;
  approvedBy: string | null;
  entryId: string | null;
  rejectionReason: string | null;
}

class FakeVoids extends PaymentVoidRepository {
  payment: VoidablePayment | undefined = receipt();
  switchOn = true;
  open = false;
  voids: StoredVoid[] = [];
  posted: VoidPost[] = [];
  recorded: ActivityInput[] = [];
  shares: CampusAmount[] = [{ campusId: 'lekki', amountMinor: 2_000_000 }];
  paymentStatus: PaymentStatus = 'posted';
  rejectChanges = true;
  approveChanges = true;
  private userId = '';

  withTx<T>(
    _scope: OrgScope,
    userId: string,
    work: (tx: PaymentVoidTx) => Promise<T>
  ): Promise<T> {
    this.userId = userId;
    return work(this.tx());
  }

  private tx(): PaymentVoidTx {
    return {
      lockPayment: () => Promise.resolve(this.payment),
      hasOpenVoid: () => Promise.resolve(this.open),
      approvalOn: () => Promise.resolve(this.switchOn),
      originalLines: () => Promise.resolve(original),
      post: (entry) => {
        this.posted.push(entry);
        return Promise.resolve(`void-entry-${this.posted.length}`);
      },
      insertSubmitted: ({ paymentId, reason }) =>
        Promise.resolve(this.add({ paymentId, reason, status: 'submitted' })),
      insertApproved: ({ paymentId, reason, entryId }) =>
        Promise.resolve(
          this.add({ paymentId, reason, status: 'approved', entryId })
        ),
      setPaymentStatus: (_id, status) => {
        this.paymentStatus = status;
        return Promise.resolve();
      },
      lockVoid: (id) => Promise.resolve(this.record(id)),
      approve: (id, entryId) => {
        const found = this.voids.find((row) => row.id === id);
        if (found !== undefined && this.approveChanges) {
          Object.assign(found, {
            status: 'approved',
            approvedBy: this.userId,
            entryId,
          });
        }
        return Promise.resolve(this.approveChanges);
      },
      reject: (id, reason) => {
        const found = this.voids.find((row) => row.id === id);
        if (found !== undefined && this.rejectChanges) {
          Object.assign(found, { status: 'rejected', rejectionReason: reason });
        }
        return Promise.resolve(this.rejectChanges);
      },
      currency: () => Promise.resolve('NGN'),
      allocationShares: () => Promise.resolve(this.shares),
      activity: {
        recordMany: (inputs) => {
          this.recorded.push(...inputs);
          return Promise.resolve();
        },
      },
    };
  }

  private add(input: {
    paymentId: string;
    reason: string;
    status: ApprovalStatus;
    entryId?: string;
  }): string {
    const id = `void-${this.voids.length + 1}`;
    this.voids.push({
      id,
      paymentId: input.paymentId,
      status: input.status,
      reason: input.reason,
      createdBy: this.userId,
      approvedBy: null,
      entryId: input.entryId ?? null,
      rejectionReason: null,
    });
    return id;
  }

  private record(id: string): VoidRecord | undefined {
    const found = this.voids.find((row) => row.id === id);
    return (
      found && {
        id: found.id,
        status: found.status,
        reason: found.reason,
        createdBy: found.createdBy,
        payment: this.payment ?? receipt(),
      }
    );
  }

  findVoid(_scope: OrgScope, id: string): Promise<PaymentVoidItem | undefined> {
    const found = this.voids.find((row) => row.id === id);
    return Promise.resolve(
      found && {
        id: found.id,
        status: found.status,
        reason: found.reason,
        createdBy: found.createdBy,
        approvedBy: found.approvedBy,
        rejectionReason: found.rejectionReason,
        createdAt: '2026-10-17T08:00:00.000Z',
        payment: {
          id: found.paymentId,
          receiptNumber: 'RCT-2026-00098',
          payerName: 'Mrs Danjuma',
        },
        amountMinor: 2_000_000,
      }
    );
  }

  listVoids(): Promise<VoidPage> {
    return Promise.resolve({ items: [], total: 0, waitingCount: 0 });
  }

  waiting(): Promise<WaitingApproval[]> {
    return Promise.resolve([]);
  }
}

function setup() {
  const voids = new FakeVoids();
  const clock = new Clock({ NODE_ENV: 'test' });
  clock.set('2026-10-17');
  const payments = {
    currency: () => Promise.resolve('NGN'),
  } as unknown as PaymentRepository;
  const service = new PaymentVoidService(payments, voids, clock);
  return { voids, service };
}

const rejected = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be refused');
};

describe('PaymentVoidService.request', () => {
  it('posts nothing, marks the receipt Cancellation waiting and keeps the reason', async () => {
    const { voids, service } = setup();

    const result = await service.request(chika, PAYMENT, {
      reason: ' Wrong child ',
    });

    expect(result.autoApproved).toBe(false);
    expect(result.void).toMatchObject({
      status: 'submitted',
      reason: 'Wrong child',
      createdBy: 'chika',
    });
    expect(voids.posted).toEqual([]);
    expect(voids.paymentStatus).toBe('void_pending');
    expect(voids.recorded).toEqual([]);
  });

  it('refuses a blank reason with 400', async () => {
    const { service } = setup();
    const error = await rejected(
      service.request(chika, PAYMENT, { reason: '   ' })
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      PAYMENT_VOID_REASON_MESSAGE
    );
  });

  it('answers 404 when the receipt is outside the finance scope', async () => {
    const { voids, service } = setup();
    voids.payment = undefined;
    expect(
      await rejected(service.request(chika, PAYMENT, { reason: 'x' }))
    ).toBeInstanceOf(NotFoundException);
  });

  it('answers 409 when a void is already waiting or approved', async () => {
    const { voids, service } = setup();
    voids.open = true;
    const error = await rejected(
      service.request(chika, PAYMENT, { reason: 'x' })
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      PAYMENT_VOID_EXISTS_MESSAGE
    );
  });

  it('answers 409 when the receipt is not Recorded', async () => {
    const { voids, service } = setup();
    voids.payment = receipt({ status: 'voided' });
    const error = await rejected(
      service.request(chika, PAYMENT, { reason: 'x' })
    );
    expect((error as ConflictException).message).toBe(
      PAYMENT_VOID_NOT_RECORDED_MESSAGE
    );
  });

  it('answers 403 when the receipt also pays students outside the finance scope', async () => {
    const { voids, service } = setup();
    voids.payment = receipt({ everyAllocationInScope: false });
    const error = await rejected(
      service.request(chika, PAYMENT, { reason: 'x' })
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe(
      PAYMENT_VOID_OTHER_CAMPUS_MESSAGE
    );
    expect(voids.posted).toEqual([]);
  });

  it('answers 409 for the payment of a store sale', async () => {
    const { voids, service } = setup();
    voids.payment = receipt({
      storeSale: { id: 'sale-1', number: 'ISS-2026-0001' },
    });
    const error = await rejected(
      service.request(chika, PAYMENT, { reason: 'x' })
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      PAYMENT_VOID_STORE_SALE_MESSAGE
    );
  });

  it('approves at once with no approver and posts the mirror when the switch is off', async () => {
    const { voids, service } = setup();
    voids.switchOn = false;

    const result = await service.request(chika, PAYMENT, {
      reason: 'Wrong child',
    });

    expect(result.autoApproved).toBe(true);
    expect(result.void).toMatchObject({ status: 'approved', approvedBy: null });
    expect(voids.posted).toHaveLength(1);
    expect(voids.paymentStatus).toBe('voided');
    expect(voids.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'payment.cancelled',
        actorUserId: 'chika',
        subjectType: 'payment',
        subjectId: PAYMENT,
        text: 'Payment RCT-2026-00098 (₦20,000 from Mrs Danjuma) was cancelled by chika.',
        data: {
          paymentId: PAYMENT,
          receiptNumber: 'RCT-2026-00098',
          amountMinor: 2_000_000,
          autoApproved: true,
          ownRequest: false,
        },
      },
    ]);
  });
});

async function waiting() {
  const ctx = setup();
  const { void: made } = await ctx.service.request(chika, PAYMENT, {
    reason: 'Wrong child',
  });
  return { ...ctx, id: made.id };
}

describe('PaymentVoidService.approve', () => {
  it('posts VOID-{reference} with the original lines swapped and marks the receipt voided', async () => {
    const { voids, service, id } = await waiting();

    const approved = await service.approve(grace, id);

    expect(approved).toMatchObject({ status: 'approved', approvedBy: 'grace' });
    expect(voids.posted).toEqual([
      {
        reference: 'VOID-CASH-20261015-A1',
        kind: 'payment_void',
        effectiveOn: '2026-10-17',
        memo: 'Void of RCT-2026-00098: Wrong child',
        sourceId: PAYMENT,
        reversesEntryId: 'entry-1',
        lines: [
          {
            ledgerAccountId: 'cash',
            studentId: null,
            familyId: null,
            campusId: 'lekki',
            debitMinor: 0,
            creditMinor: 2_000_000,
          },
          {
            ledgerAccountId: 'receivable',
            studentId: 'ada',
            familyId: null,
            campusId: 'lekki',
            debitMinor: 2_000_000,
            creditMinor: 0,
          },
        ],
      },
    ]);
    expect(voids.paymentStatus).toBe('voided');
  });

  it('records one cancellation row per campus, naming the approver', async () => {
    const { voids, service, id } = await waiting();
    voids.shares = [
      { campusId: 'lekki', amountMinor: 1_500_000 },
      { campusId: 'ikeja', amountMinor: 500_000 },
    ];

    await service.approve(grace, id);

    expect(
      voids.recorded.map((row) => [row.campusId, row.kind, row.text])
    ).toEqual([
      [
        'lekki',
        'payment.cancelled',
        'Payment RCT-2026-00098 from Mrs Danjuma (₦15,000 of it for this campus) was cancelled, approved by grace.',
      ],
      [
        'ikeja',
        'payment.cancelled',
        'Payment RCT-2026-00098 from Mrs Danjuma (₦5,000 of it for this campus) was cancelled, approved by grace.',
      ],
    ]);
    expect(voids.recorded[0]?.actorUserId).toBe('grace');
    expect(voids.recorded[0]?.data).toMatchObject({ autoApproved: false });
  });

  it('answers 403 when the receipt also pays students outside the finance scope, and posts nothing', async () => {
    const { voids, service, id } = await waiting();
    voids.payment = receipt({ everyAllocationInScope: false });
    const error = await rejected(service.approve(grace, id));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(voids.posted).toEqual([]);
    expect(voids.recorded).toEqual([]);
  });

  it('answers 409 SelfApproval for the creator and posts nothing', async () => {
    const { voids, service, id } = await waiting();
    const error = await rejected(service.approve(chika, id));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(voids.posted).toEqual([]);
    expect(voids.recorded).toEqual([]);
  });

  it('answers 404 for a void outside the finance scope', async () => {
    const { service } = setup();
    expect(await rejected(service.approve(grace, 'nope'))).toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 409 AlreadyDecided when it was decided first, and posts nothing', async () => {
    const { voids, service, id } = await waiting();
    await service.approve(grace, id);
    voids.posted = [];
    voids.recorded = [];

    const error = await rejected(service.approve(as('yemi'), id));

    expect((error as ConflictException).getResponse()).toEqual({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
    expect(voids.posted).toEqual([]);
    expect(voids.recorded).toEqual([]);
  });

  it('answers 409 AlreadyDecided when the conditional update changes no row', async () => {
    const { voids, service, id } = await waiting();
    voids.approveChanges = false;
    const error = await rejected(service.approve(grace, id));
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'AlreadyDecided',
    });
    expect(voids.recorded).toEqual([]);
  });
});

describe('PaymentVoidService.decline', () => {
  it('keeps the reason, posts nothing and returns the receipt to Recorded', async () => {
    const { voids, service, id } = await waiting();

    const declined = await service.decline(grace, id, ' Not agreed ');

    expect(declined).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Not agreed',
    });
    expect(voids.posted).toEqual([]);
    expect(voids.paymentStatus).toBe('posted');
    expect(voids.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'payment_void.declined',
        actorUserId: 'grace',
        subjectType: 'payment_void',
        subjectId: id,
        text: 'Cancelling payment RCT-2026-00098 was declined: Not agreed',
        data: {
          voidId: id,
          paymentId: PAYMENT,
          receiptNumber: 'RCT-2026-00098',
          amountMinor: 2_000_000,
        },
      },
    ]);
  });

  it('accepts a new request after a decline', async () => {
    const { voids, service, id } = await waiting();
    await service.decline(grace, id, 'Not agreed');

    const again = await service.request(chika, PAYMENT, {
      reason: 'Really wrong',
    });

    expect(again.void.status).toBe('submitted');
    expect(voids.paymentStatus).toBe('void_pending');
  });

  it('refuses a blank reason with 400 before touching anything', async () => {
    const { voids, service, id } = await waiting();
    const error = await rejected(service.decline(grace, id, '  '));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(DECLINE_REASON_MESSAGE);
    expect(voids.paymentStatus).toBe('void_pending');
  });

  it('answers 409 SelfApproval for the creator', async () => {
    const { service, id } = await waiting();
    const error = await rejected(service.decline(chika, id, 'No'));
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'SelfApproval',
    });
  });

  it('records no row for a void that was already decided', async () => {
    const { voids, service, id } = await waiting();
    voids.rejectChanges = false;
    const error = await rejected(service.decline(grace, id, 'No'));
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'AlreadyDecided',
    });
    expect(voids.recorded).toEqual([]);
  });

  it('answers 404 for a void outside the finance scope', async () => {
    const { service } = setup();
    expect(await rejected(service.decline(grace, 'nope', 'No'))).toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 409 AlreadyDecided for a void that is no longer waiting', async () => {
    const { service, id } = await waiting();
    await service.decline(grace, id, 'No');
    const error = await rejected(service.decline(as('yemi'), id, 'No'));
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'AlreadyDecided',
    });
  });
});
