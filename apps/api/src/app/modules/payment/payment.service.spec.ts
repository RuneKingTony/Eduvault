import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  PAYMENT_ACCOUNT_GATEWAY_MESSAGE,
  PAYMENT_ACCOUNT_METHOD_MESSAGE,
  PAYMENT_ACCOUNT_RETIRED_MESSAGE,
  PAYMENT_FUTURE_DATE_MESSAGE,
  PAYMENT_METHOD_OFF_MESSAGE,
  PAYMENT_PROOF_REQUIRED_MESSAGE,
  PAYMENT_PROOF_TAKEN_MESSAGE,
  PAYMENT_PROVIDER_REFERENCE_TAKEN_MESSAGE,
  PAYMENT_REFERENCE_TAKEN_MESSAGE,
  paymentProviderReferenceUsedMessage,
  paymentReferenceUsedMessage,
  paymentSplitMismatchMessage,
  type Payment,
  type PaymentMethods,
  type RecordPayment,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { UsableMoneyAccount } from '../../common/money-accounts';
import type { MoneyAccountService } from '../money-account/money-account.service';
import { paymentRequestHash, type ProofState } from '../../common/payments';
import {
  PaymentRepository,
  type ExistingPayment,
  type InsertOutcome,
  type NewRecordedPayment,
  type PaymentPage,
  type PaymentScope,
  type RecordingPeople,
} from './payment.repository';
import { PaymentService } from './payment.service';

const ADA = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const CHIDI = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const GUARDIAN = '7c9a0b3d-1f2e-4a5b-8c6d-9e0f1a2b3c4d';
const ACCOUNT = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';
const PROOF = '2b6d9f10-4c8a-4e7b-9a1c-3d5e7f9b1a2c';

const ctx = {
  organizationId: 'school-a',
  user: { id: 'chika', email: 'chika@eduvault.test', name: 'Chika' },
  campusScope: ['lekki'],
} as unknown as OrgContext;

const body: RecordPayment = {
  reference: 'TRF-20261007-K3Q7ZA',
  payerGuardianId: GUARDIAN,
  payerName: undefined,
  moneyAccountId: ACCOUNT,
  method: 'transfer',
  providerReference: undefined,
  proofFileId: PROOF,
  amountMinor: 24_000_000,
  paidOn: '2026-10-07',
  allocations: [
    { studentId: ADA, amountMinor: 18_000_000 },
    { studentId: CHIDI, amountMinor: 6_000_000 },
  ],
};

const stored = (id = 'payment-1'): Omit<Payment, 'currency'> => ({
  id,
  receiptNumber: 'RCT-2026-00088',
  reference: body.reference,
  providerReference: null,
  paidOn: body.paidOn,
  method: 'transfer',
  status: 'posted',
  payerName: 'Ngozi Okeke',
  payerGuardianId: GUARDIAN,
  moneyAccount: { id: ACCOUNT, label: 'GTBank current · ending 4417' },
  amountMinor: body.amountMinor,
  recordedBy: 'Chika',
  recordedAt: '2026-10-07T09:00:00.000Z',
  proof: { fileId: PROOF, fileName: 'alert.png' },
  allocations: [],
  void: null,
  storeSale: null,
  entry: null,
  voidEntry: null,
});

const okAccount = (kind: 'bank' | 'cash' | 'pos'): UsableMoneyAccount => ({
  status: 'ok',
  ledgerAccountId: 'ledger-1',
  campusId: null,
  kind,
});

class FakePayments extends PaymentRepository {
  methods: PaymentMethods = { cash: true, transfer: true, pos: true };
  existing: ExistingPayment | undefined;
  raced: ExistingPayment | undefined;
  lookups = 0;
  visible: Omit<Payment, 'currency'> | undefined = stored();
  account: UsableMoneyAccount = okAccount('bank');
  guardian: string | undefined = 'Ngozi Okeke';
  inScope: string[] = [ADA, CHIDI];
  proofState: ProofState = 'free';
  proofUploaders: string[] = [];
  providerPayment: ExistingPayment | undefined;
  outcome: InsertOutcome = {
    status: 'recorded',
    id: 'payment-1',
    receiptNumber: 'RCT-1',
  };
  inserted: NewRecordedPayment[] = [];

  currency() {
    return Promise.resolve('NGN');
  }

  list(_scope: PaymentScope, _query: unknown): Promise<PaymentPage> {
    return Promise.resolve({
      items: [],
      total: 0,
      summary: { receiptCount: 0, receivedMinor: 0, cancellationsWaiting: 0 },
    });
  }

  find() {
    return Promise.resolve(this.visible);
  }

  findByReference() {
    this.lookups += 1;
    return Promise.resolve(this.lookups > 1 ? this.raced : this.existing);
  }

  paymentMethods() {
    return Promise.resolve(this.methods);
  }

  recordingAccount() {
    return Promise.resolve(this.account);
  }

  guardianName() {
    return Promise.resolve(this.guardian);
  }

  studentsInScope(_scope: PaymentScope, ids: readonly string[]) {
    return Promise.resolve(ids.filter((id) => this.inScope.includes(id)));
  }

  proof(_organizationId: string, userId: string) {
    this.proofUploaders.push(userId);
    return Promise.resolve(this.proofState);
  }

  findByProviderReference() {
    return Promise.resolve(this.providerPayment);
  }

  insert(input: NewRecordedPayment) {
    this.inserted.push(input);
    return Promise.resolve(this.outcome);
  }

  recordingPeople(): Promise<RecordingPeople> {
    return Promise.resolve({ payers: [], students: [] });
  }
}

function setup() {
  const payments = new FakePayments();
  const clock = new Clock({ NODE_ENV: 'test' });
  clock.set('2026-10-07');
  const moneyAccounts = {
    listForRecording: vi
      .fn()
      .mockResolvedValue([{ id: ACCOUNT, label: 'GTBank current' }]),
  };
  const service = new PaymentService(
    payments,
    clock,
    moneyAccounts as unknown as MoneyAccountService
  );
  return { payments, service, moneyAccounts };
}

const rejected = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be refused');
};

describe('PaymentService.record', () => {
  it('records a payment and names the payer from the guardian', async () => {
    const { payments, service } = setup();

    const result = await service.record(ctx, body);

    expect(result).toMatchObject({ replayed: false, currency: 'NGN' });
    expect(payments.inserted).toHaveLength(1);
    expect(payments.inserted[0]).toMatchObject({
      organizationId: 'school-a',
      userId: 'chika',
      year: 2026,
      reference: body.reference,
      payerGuardianId: GUARDIAN,
      payerName: 'Ngozi Okeke',
      ledgerAccountId: 'ledger-1',
      accountCampusId: null,
      amountMinor: 24_000_000,
      providerReference: null,
      proofFileId: PROOF,
      requestHash: paymentRequestHash(body),
    });
  });

  it('uses the typed name when someone else paid', async () => {
    const { payments, service } = setup();
    payments.account = okAccount('cash');

    await service.record(ctx, {
      ...body,
      payerGuardianId: undefined,
      payerName: 'Mrs Ojo',
      method: 'cash',
      proofFileId: undefined,
    });

    expect(payments.inserted[0]).toMatchObject({
      payerGuardianId: null,
      payerName: 'Mrs Ojo',
      proofFileId: null,
    });
  });

  it('takes a cash payment without proof into a cash account', async () => {
    const { payments, service } = setup();
    payments.account = okAccount('cash');
    await expect(
      service.record(ctx, { ...body, method: 'cash', proofFileId: undefined })
    ).resolves.toMatchObject({ replayed: false });
  });

  it('refuses a bank transfer into a cash account, and takes cash into a bank account', async () => {
    const { payments, service } = setup();
    payments.account = okAccount('cash');
    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_ACCOUNT_METHOD_MESSAGE
    );
    payments.account = okAccount('bank');
    await expect(
      service.record(ctx, { ...body, method: 'cash', proofFileId: undefined })
    ).resolves.toMatchObject({ replayed: false });
  });

  it('takes a POS payment into a POS or bank account', async () => {
    const { payments, service } = setup();
    for (const kind of ['pos', 'bank'] as const) {
      payments.account = okAccount(kind);
      await expect(
        service.record(ctx, {
          ...body,
          method: 'pos',
          proofFileId: undefined,
          reference: `POS-${kind}-20261007`,
        })
      ).resolves.toMatchObject({ replayed: false });
    }
  });

  it('reports a race that another request won as a replay', async () => {
    const { payments, service } = setup();
    payments.outcome = { status: 'replayed', id: 'payment-1' };

    await expect(service.record(ctx, body)).resolves.toMatchObject({
      replayed: true,
    });
    expect(payments.inserted).toHaveLength(1);
  });

  it('hands the recorder’s name to the repository for the activity row', async () => {
    const { payments, service } = setup();

    await service.record(ctx, body);

    expect(payments.inserted.map((row) => row.userName)).toEqual([
      ctx.user.name,
    ]);
  });
});

describe('PaymentService.record replay', () => {
  it('returns the earlier payment and posts nothing for an identical request', async () => {
    const { payments, service } = setup();
    payments.existing = {
      id: 'payment-1',
      receiptNumber: 'RCT-2026-00088',
      requestHash: paymentRequestHash(body),
    };

    const result = await service.record(ctx, {
      ...body,
      allocations: body.allocations.toReversed(),
    });

    expect(result).toMatchObject({ replayed: true, id: 'payment-1' });
    expect(payments.inserted).toEqual([]);
  });

  it('replays even after the method was switched off', async () => {
    const { payments, service } = setup();
    payments.methods = { cash: true, transfer: false, pos: true };
    payments.existing = {
      id: 'payment-1',
      receiptNumber: 'RCT-2026-00088',
      requestHash: paymentRequestHash(body),
    };

    await expect(service.record(ctx, body)).resolves.toMatchObject({
      replayed: true,
    });
  });

  it('refuses the same reference with different details, naming the receipt', async () => {
    const { payments, service } = setup();
    payments.existing = {
      id: 'payment-1',
      receiptNumber: 'RCT-2026-00088',
      requestHash: paymentRequestHash(body),
    };

    const error = await rejected(
      service.record(ctx, { ...body, amountMinor: 1, allocations: [] })
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      paymentReferenceUsedMessage(body.reference, 'RCT-2026-00088')
    );
    expect(payments.inserted).toEqual([]);
  });

  it('refuses a replay of a payment the caller cannot see', async () => {
    const { payments, service } = setup();
    payments.visible = undefined;
    payments.existing = {
      id: 'payment-1',
      receiptNumber: 'RCT-2026-00088',
      requestHash: paymentRequestHash(body),
    };

    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_REFERENCE_TAKEN_MESSAGE
    );
  });

  it('does not name the receipt of a payment the caller cannot see, even for different details', async () => {
    const { payments, service } = setup();
    payments.visible = undefined;
    payments.existing = {
      id: 'payment-1',
      receiptNumber: 'RCT-2026-00088',
      requestHash: 'another-request',
    };

    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_REFERENCE_TAKEN_MESSAGE
    );
  });

  it('replays when a retry sends a different proof or provider reference', async () => {
    const { payments, service } = setup();
    payments.existing = {
      id: 'payment-1',
      receiptNumber: 'RCT-2026-00088',
      requestHash: paymentRequestHash(body),
    };

    await expect(
      service.record(ctx, {
        ...body,
        proofFileId: CHIDI,
        providerReference: 'GTB/FT/9',
      })
    ).resolves.toMatchObject({ replayed: true, id: 'payment-1' });
    expect(payments.inserted).toEqual([]);
  });
});

describe('PaymentService.record validation order', () => {
  it('checks the method before anything else', async () => {
    const { payments, service } = setup();
    payments.methods = { cash: true, transfer: false, pos: true };

    const error = await rejected(
      service.record(ctx, {
        ...body,
        proofFileId: undefined,
        paidOn: '2099-01-01',
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      PAYMENT_METHOD_OFF_MESSAGE
    );
  });

  it('asks for the proof of a transfer before looking at the date', async () => {
    const { service } = setup();

    await expect(
      service.record(ctx, {
        ...body,
        proofFileId: undefined,
        paidOn: '2099-01-01',
      })
    ).rejects.toThrow(PAYMENT_PROOF_REQUIRED_MESSAGE);
  });

  it('refuses a date after today before checking the split', async () => {
    const { service } = setup();

    await expect(
      service.record(ctx, { ...body, paidOn: '2026-10-08', amountMinor: 1 })
    ).rejects.toThrow(PAYMENT_FUTURE_DATE_MESSAGE);
  });

  it('accepts today and earlier dates', async () => {
    const { service } = setup();
    await expect(
      service.record(ctx, { ...body, paidOn: '2026-10-07' })
    ).resolves.toMatchObject({ replayed: false });
    await expect(
      service.record(ctx, { ...body, paidOn: '2020-01-01' })
    ).resolves.toMatchObject({ replayed: false });
  });

  it('refuses a split that does not add up to the amount', async () => {
    const { payments, service } = setup();

    await expect(
      service.record(ctx, { ...body, amountMinor: 25_000_000 })
    ).rejects.toThrow(paymentSplitMismatchMessage(24_000_000, 25_000_000));
    expect(payments.inserted).toEqual([]);
  });

  it('refuses a retired or gateway account with 400 and another school or campus account with 404', async () => {
    const { payments, service } = setup();

    payments.account = { status: 'retired' };
    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_ACCOUNT_RETIRED_MESSAGE
    );

    payments.account = { status: 'gateway' };
    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_ACCOUNT_GATEWAY_MESSAGE
    );

    payments.account = { status: 'missing' };
    await expect(service.record(ctx, body)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 404 for a guardian outside the caller’s reach', async () => {
    const { payments, service } = setup();
    payments.guardian = undefined;

    await expect(service.record(ctx, body)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 404 when any allocated student is out of scope', async () => {
    const { payments, service } = setup();
    payments.inScope = [ADA];

    await expect(service.record(ctx, body)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(payments.inserted).toEqual([]);
  });

  it('answers 404 for a proof that is not this school’s and 409 for one on another payment', async () => {
    const { payments, service } = setup();

    payments.proofState = 'missing';
    await expect(service.record(ctx, body)).rejects.toBeInstanceOf(
      NotFoundException
    );

    payments.proofState = 'taken';
    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_PROOF_TAKEN_MESSAGE
    );
  });

  it('answers 409 naming the receipt when the provider reference is taken', async () => {
    const { payments, service } = setup();
    payments.providerPayment = {
      id: 'payment-1',
      receiptNumber: 'RCT-2026-00001',
      requestHash: 'other',
    };

    await expect(
      service.record(ctx, { ...body, providerReference: 'GTB/FT/1' })
    ).rejects.toThrow(
      paymentProviderReferenceUsedMessage('GTB/FT/1', 'RCT-2026-00001')
    );
  });

  it('keeps the receipt number back when the provider reference is on a payment out of scope', async () => {
    const { payments, service } = setup();
    payments.visible = undefined;
    payments.providerPayment = {
      id: 'payment-9',
      receiptNumber: 'RCT-2026-00001',
      requestHash: 'other',
    };

    await expect(
      service.record(ctx, { ...body, providerReference: 'GTB/FT/1' })
    ).rejects.toThrow(PAYMENT_PROVIDER_REFERENCE_TAKEN_MESSAGE);
  });

  it('only accepts a proof the caller uploaded', async () => {
    const { payments, service } = setup();

    await service.record(ctx, body);

    expect(payments.proofUploaders).toEqual([ctx.user.id]);
  });
});

describe('PaymentService.record insert outcomes', () => {
  const existing: ExistingPayment = {
    id: 'payment-1',
    receiptNumber: 'RCT-1',
    requestHash: 'other',
  };

  it('turns each refusal from the database into a 409', async () => {
    const { payments, service } = setup();

    payments.outcome = { status: 'reference_used' };
    payments.raced = existing;
    await expect(service.record(ctx, body)).rejects.toThrow(
      paymentReferenceUsedMessage(body.reference, 'RCT-1')
    );

    payments.lookups = 0;
    payments.raced = undefined;
    payments.outcome = { status: 'provider_reference_used' };
    payments.providerPayment = { ...existing, receiptNumber: 'RCT-2' };
    await expect(
      service.record(ctx, { ...body, providerReference: 'GTB/1' })
    ).rejects.toThrow(paymentProviderReferenceUsedMessage('GTB/1', 'RCT-2'));

    payments.outcome = { status: 'proof_taken' };
    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_PROOF_TAKEN_MESSAGE
    );
  });

  it('answers the generic message when the reference is on no payment or one out of scope', async () => {
    const { payments, service } = setup();
    payments.outcome = { status: 'reference_used' };

    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_REFERENCE_TAKEN_MESSAGE
    );

    payments.raced = existing;
    payments.visible = undefined;
    await expect(service.record(ctx, body)).rejects.toThrow(
      PAYMENT_REFERENCE_TAKEN_MESSAGE
    );
  });
});

describe('PaymentService reads', () => {
  it('answers 404 for a receipt out of scope or in another school', async () => {
    const { payments, service } = setup();
    payments.visible = undefined;

    await expect(service.get(ctx, 'payment-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('adds the school currency to a receipt', async () => {
    const { service } = setup();
    await expect(service.get(ctx, 'payment-1')).resolves.toMatchObject({
      id: 'payment-1',
      currency: 'NGN',
    });
  });

  it('dates the Record a payment sheet with the school’s today', async () => {
    const { service } = setup();

    const options = await service.recordingOptions(ctx);

    expect(options.today).toBe('2026-10-07');
  });

  it('lists with the school currency', async () => {
    const { service } = setup();
    await expect(
      service.list(ctx, { page: 1, pageSize: 10 })
    ).resolves.toMatchObject({ currency: 'NGN', total: 0 });
  });
});
