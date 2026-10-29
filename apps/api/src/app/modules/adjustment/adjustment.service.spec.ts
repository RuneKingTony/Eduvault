import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ADJUSTMENT_ACCOUNT_NOT_ALLOWED_MESSAGE,
  ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE,
  ADJUSTMENT_ACCOUNT_RETIRED_NOW_MESSAGE,
  ADJUSTMENT_CHARGE_MESSAGE,
  ALREADY_DECIDED_MESSAGE,
  DECLINE_REASON_MESSAGE,
  PAYMENT_ACCOUNT_GATEWAY_MESSAGE,
  PAYMENT_ACCOUNT_RETIRED_MESSAGE,
  PAYMENT_REFERENCE_TAKEN_MESSAGE,
  SELF_APPROVAL_MESSAGE,
  adjustmentReferenceUsedMessage,
  adjustmentRefundCapMessage,
  adjustmentRefundNowCapMessage,
  adjustmentWriteOffCapMessage,
  type CreateAdjustment,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { AdjustmentService } from './adjustment.service';
import { FakeAdjustmentRepository } from './fake-adjustment.repository';

const ADA = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const CHARGE = '5d7e0f2a-3c1b-4e0a-9d7c-2f6a1b8c9d10';
const GTBANK = '9a1d4f60-6a4b-4f43-8d0c-1b2c3d4e5f60';
const TUITION = '2b6d9f10-4c8a-4e7b-9a1c-3d5e7f9b1a2c';

const as = (id: string) =>
  ({
    organizationId: 'school-a',
    user: { id, email: `${id}@eduvault.test`, name: id },
    campusScope: 'all',
  }) as unknown as OrgContext;

const chika = as('chika');
const grace = as('grace');

const creditNote = (
  over: Partial<CreateAdjustment> = {}
): CreateAdjustment => ({
  kind: 'credit_note',
  studentId: ADA,
  amountMinor: 1_000_000,
  reason: 'Late enrolment',
  ...over,
});

function setup(balanceMinor = 1_200_000) {
  const repo = new FakeAdjustmentRepository();
  repo.seedStudent({
    id: ADA,
    name: 'Ada Obi',
    admissionNumber: 'GF-0001',
    campusId: 'lekki',
    balanceMinor,
  });
  repo.sentCharges.add(CHARGE);
  repo.creditAccounts.set(TUITION, { status: 'ok', ledgerAccountId: TUITION });
  repo.refundAccounts.set(GTBANK, {
    status: 'ok',
    kind: 'bank',
    ledgerAccountId: 'gtbank-ledger',
    campusId: null,
  });
  const clock = new Clock({ NODE_ENV: 'test' });
  clock.set('2026-10-17');
  return { repo, service: new AdjustmentService(repo, clock) };
}

const rejected = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be refused');
};

const bodyOf = (error: unknown) => (error as BadRequestException).getResponse();

describe('AdjustmentService.create', () => {
  it('saves a request as waiting with an ADJ number, and posts nothing', async () => {
    const { repo, service } = setup();

    const result = await service.create(chika, creditNote());

    expect(result.autoApproved).toBe(false);
    expect(result.adjustment).toMatchObject({
      number: 'ADJ-2026-0001',
      status: 'submitted',
      createdBy: 'chika',
      ledgerAccountId: 'discounts-given',
    });
    expect(repo.posted).toEqual([]);
    expect(repo.recorded).toEqual([]);
  });

  it('numbers each request in turn', async () => {
    const { service } = setup();
    await service.create(chika, creditNote());
    const second = await service.create(chika, creditNote());
    expect(second.adjustment.number).toBe('ADJ-2026-0002');
  });

  it('answers 404 for a student outside the finance scope', async () => {
    const { service } = setup();
    expect(
      await rejected(service.create(chika, creditNote({ studentId: CHARGE })))
    ).toBeInstanceOf(NotFoundException);
  });

  it('cancels a balance up to what is owed and answers 400 above it', async () => {
    const { service } = setup(1_200_000);
    await service.create(chika, {
      kind: 'write_off',
      studentId: ADA,
      amountMinor: 1_200_000,
      reason: 'Left the school',
    });
    const error = await rejected(
      service.create(chika, {
        kind: 'write_off',
        studentId: ADA,
        amountMinor: 1_500_000,
        reason: 'Left the school',
      })
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(bodyOf(error)).toMatchObject({
      message: adjustmentWriteOffCapMessage('Ada Obi', 1_200_000),
    });
  });

  it('refunds up to the credit held and answers 400 with creditMinor above it', async () => {
    const { service } = setup(-500_000);
    const refund = {
      kind: 'refund' as const,
      studentId: ADA,
      moneyAccountId: GTBANK,
      reason: 'Overpaid',
    };
    expect(
      (await service.create(chika, { ...refund, amountMinor: 500_000 }))
        .adjustment.moneyAccountId
    ).toBe(GTBANK);
    const error = await rejected(
      service.create(chika, { ...refund, amountMinor: 600_000 })
    );
    expect(bodyOf(error)).toEqual({
      message: adjustmentRefundCapMessage('Ada Obi', 500_000),
      creditMinor: 500_000,
    });
  });

  it('lets a fee reduction exceed what is owed', async () => {
    const { service } = setup(100_000);
    const result = await service.create(
      chika,
      creditNote({ amountMinor: 9_000_000 })
    );
    expect(result.adjustment.status).toBe('submitted');
  });

  it('takes a chosen income account and one of the student’s sent charges', async () => {
    const { service } = setup();
    const result = await service.create(
      chika,
      creditNote({ ledgerAccountId: TUITION, invoiceId: CHARGE })
    );
    expect(result.adjustment).toMatchObject({
      ledgerAccountId: TUITION,
      invoiceId: CHARGE,
    });
  });

  it('answers 400 for an account that is not allowed and a charge that is not the student’s', async () => {
    const { repo, service } = setup();
    repo.creditAccounts.set(GTBANK, { status: 'not_allowed' });
    repo.knownCharges.add(GTBANK);
    const account = await rejected(
      service.create(chika, creditNote({ ledgerAccountId: GTBANK }))
    );
    expect(bodyOf(account)).toMatchObject({
      message: ADJUSTMENT_ACCOUNT_NOT_ALLOWED_MESSAGE,
    });
    const charge = await rejected(
      service.create(chika, creditNote({ invoiceId: GTBANK }))
    );
    expect(bodyOf(charge)).toMatchObject({
      message: ADJUSTMENT_CHARGE_MESSAGE,
    });
  });

  it('answers 404 for an account or a charge this school does not have', async () => {
    const { service } = setup();
    expect(
      await rejected(
        service.create(chika, creditNote({ ledgerAccountId: GTBANK }))
      )
    ).toBeInstanceOf(NotFoundException);
    expect(
      await rejected(service.create(chika, creditNote({ invoiceId: GTBANK })))
    ).toBeInstanceOf(NotFoundException);
  });

  it('answers 400 for accounts that do not belong to the kind', async () => {
    const { service } = setup();
    const error = await rejected(
      service.create(chika, {
        kind: 'write_off',
        studentId: ADA,
        amountMinor: 100,
        reason: 'x',
        invoiceId: CHARGE,
      })
    );
    expect(bodyOf(error)).toMatchObject({
      message: ADJUSTMENT_ACCOUNT_NOT_ALLOWED_MESSAGE,
    });
    const money = await rejected(
      service.create(chika, creditNote({ moneyAccountId: GTBANK }))
    );
    expect(money).toBeInstanceOf(BadRequestException);
  });

  it('needs a money account for a refund, and answers 404, 400 and 400 for missing, retired and gateway accounts', async () => {
    const { repo, service } = setup(-500_000);
    const refund = {
      kind: 'refund' as const,
      studentId: ADA,
      amountMinor: 100_000,
      reason: 'Overpaid',
    };
    expect(bodyOf(await rejected(service.create(chika, refund)))).toMatchObject(
      {
        message: ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE,
      }
    );
    expect(
      await rejected(
        service.create(chika, { ...refund, moneyAccountId: CHARGE })
      )
    ).toBeInstanceOf(NotFoundException);
    repo.refundAccounts.set(CHARGE, { status: 'retired' });
    expect(
      bodyOf(
        await rejected(
          service.create(chika, { ...refund, moneyAccountId: CHARGE })
        )
      )
    ).toMatchObject({ message: PAYMENT_ACCOUNT_RETIRED_MESSAGE });
    repo.refundAccounts.set(CHARGE, { status: 'gateway' });
    expect(
      bodyOf(
        await rejected(
          service.create(chika, { ...refund, moneyAccountId: CHARGE })
        )
      )
    ).toMatchObject({ message: PAYMENT_ACCOUNT_GATEWAY_MESSAGE });
  });

  it('approves at once with no approver and posts when the kind is switched off', async () => {
    const { repo, service } = setup();
    repo.switchedOff.add('credit_note');

    const result = await service.create(chika, creditNote());

    expect(result.autoApproved).toBe(true);
    expect(result.adjustment).toMatchObject({
      status: 'approved',
      approvedBy: null,
      journalEntryId: 'entry-1',
    });
    expect(repo.posted).toHaveLength(1);
    expect(repo.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'adjustment.approved',
        actorUserId: 'chika',
        subjectType: 'adjustment',
        subjectId: result.adjustment.id,
        text: 'Reduce a fee ADJ-2026-0001 for Ada Obi, ₦10,000, applied by chika.',
        data: {
          adjustmentId: result.adjustment.id,
          number: 'ADJ-2026-0001',
          adjustmentKind: 'credit_note',
          studentId: ADA,
          amountMinor: 1_000_000,
          autoApproved: true,
          ownRequest: false,
        },
      },
    ]);
  });

  it('keeps a kind that is still on waiting while another is switched off', async () => {
    const { repo, service } = setup();
    repo.switchedOff.add('refund');
    const result = await service.create(chika, creditNote());
    expect(result.autoApproved).toBe(false);
  });
});

describe('AdjustmentService.create with a reference', () => {
  it('answers the same request again with the first adjustment and creates nothing', async () => {
    const { repo, service } = setup();

    const first = await service.create(chika, creditNote({ reference: 'R-1' }));
    const again = await service.create(chika, creditNote({ reference: 'R-1' }));

    expect(again.adjustment.id).toBe(first.adjustment.id);
    expect(repo.stored).toHaveLength(1);
    expect(repo.numbers).toEqual(['ADJ-2026-0001']);
  });

  it('answers 409 with the number when the reference carries another request', async () => {
    const { repo, service } = setup();
    await service.create(chika, creditNote({ reference: 'R-1' }));

    const error = await rejected(
      service.create(chika, creditNote({ reference: 'R-1', amountMinor: 5 }))
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(bodyOf(error)).toMatchObject({
      message: adjustmentReferenceUsedMessage('R-1', 'ADJ-2026-0001'),
    });
    expect(repo.stored).toHaveLength(1);
  });

  it('answers 409 without the number when the holder is out of scope', async () => {
    const { repo, service } = setup();
    await service.create(chika, creditNote({ reference: 'R-1' }));
    repo.students.clear();

    const error = await rejected(
      service.create(chika, creditNote({ reference: 'R-1' }))
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(bodyOf(error)).toMatchObject({
      message: PAYMENT_REFERENCE_TAKEN_MESSAGE,
    });
  });

  it('keeps a request with no reference unlimited', async () => {
    const { repo, service } = setup();

    await service.create(chika, creditNote());
    await service.create(chika, creditNote());

    expect(repo.stored).toHaveLength(2);
  });

  it('reports an applied-at-once replay as auto-approved and posts once', async () => {
    const { repo, service } = setup();
    repo.switchedOff.add('credit_note');

    await service.create(chika, creditNote({ reference: 'R-1' }));
    const again = await service.create(chika, creditNote({ reference: 'R-1' }));

    expect(again.autoApproved).toBe(true);
    expect(repo.posted).toHaveLength(1);
  });
});

describe('AdjustmentService.approve', () => {
  it('posts the balanced entry under the ADJ number and marks it approved by the approver', async () => {
    const { repo, service } = setup();
    const { adjustment } = await service.create(chika, creditNote());

    const approved = await service.approve(grace, adjustment.id);

    expect(approved).toMatchObject({ status: 'approved', approvedBy: 'grace' });
    expect(repo.posted).toEqual([
      expect.objectContaining({
        reference: 'ADJ-2026-0001',
        kind: 'adjustment',
        effectiveOn: '2026-10-17',
        memo: 'Reduce a fee: Late enrolment',
        sourceId: adjustment.id,
      }),
    ]);
  });

  it('answers 409 SelfApproval for the creator and posts nothing', async () => {
    const { repo, service } = setup();
    const { adjustment } = await service.create(chika, creditNote());
    const error = await rejected(service.approve(chika, adjustment.id));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'SelfApproval',
      message: SELF_APPROVAL_MESSAGE,
    });
    expect(repo.posted).toEqual([]);
  });

  it('answers 404 for a request outside the finance scope', async () => {
    const { service } = setup();
    expect(await rejected(service.approve(grace, 'nope'))).toBeInstanceOf(
      NotFoundException
    );
  });

  it('answers 409 AlreadyDecided when it was decided first, posting once', async () => {
    const { repo, service } = setup();
    const { adjustment } = await service.create(chika, creditNote());
    await service.approve(grace, adjustment.id);
    const error = await rejected(service.approve(as('yemi'), adjustment.id));
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'AlreadyDecided',
      message: ALREADY_DECIDED_MESSAGE,
    });
    expect(repo.posted).toHaveLength(1);
  });

  it('answers 409 when a write-off is now above the balance owed, posting nothing', async () => {
    const { repo, service } = setup(1_200_000);
    const { adjustment } = await service.create(chika, {
      kind: 'write_off',
      studentId: ADA,
      amountMinor: 1_200_000,
      reason: 'Left the school',
    });
    repo.students.set(ADA, {
      id: ADA,
      name: 'Ada Obi',
      admissionNumber: 'GF-0001',
      campusId: 'lekki',
      balanceMinor: 200_000,
    });
    const error = await rejected(service.approve(grace, adjustment.id));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toContain('now owes ₦2,000');
    expect(repo.posted).toEqual([]);
  });

  it('answers 409 when a refund is now above the credit held, posting nothing', async () => {
    const { repo, service } = setup(-500_000);
    const { adjustment } = await service.create(chika, {
      kind: 'refund',
      studentId: ADA,
      amountMinor: 500_000,
      moneyAccountId: GTBANK,
      reason: 'Overpaid',
    });
    repo.students.set(ADA, {
      id: ADA,
      name: 'Ada Obi',
      admissionNumber: 'GF-0001',
      campusId: 'lekki',
      balanceMinor: 700_000,
    });
    const error = await rejected(service.approve(grace, adjustment.id));
    expect((error as ConflictException).message).toBe(
      adjustmentRefundNowCapMessage('Ada Obi', 0)
    );
    expect(repo.posted).toEqual([]);
  });

  it('answers 409 when the money account was retired while the refund waited, posting nothing', async () => {
    const { repo, service } = setup(-500_000);
    const { adjustment } = await service.create(chika, {
      kind: 'refund',
      studentId: ADA,
      amountMinor: 500_000,
      moneyAccountId: GTBANK,
      reason: 'Overpaid',
    });
    repo.retiredAccounts.add(GTBANK);
    const error = await rejected(service.approve(grace, adjustment.id));
    expect((error as ConflictException).message).toBe(
      ADJUSTMENT_ACCOUNT_RETIRED_NOW_MESSAGE
    );
    expect(repo.posted).toEqual([]);
  });

  it('answers 409 when the income account was retired while the fee reduction waited', async () => {
    const { repo, service } = setup();
    const { adjustment } = await service.create(
      chika,
      creditNote({ ledgerAccountId: TUITION })
    );
    repo.creditAccounts.set(TUITION, { status: 'not_allowed' });
    const error = await rejected(service.approve(grace, adjustment.id));
    expect((error as ConflictException).message).toBe(
      ADJUSTMENT_ACCOUNT_RETIRED_NOW_MESSAGE
    );
    expect(repo.posted).toEqual([]);
  });

  it('posts a refund to the money account on its own campus', async () => {
    const { repo, service } = setup(-500_000);
    const { adjustment } = await service.create(chika, {
      kind: 'refund',
      studentId: ADA,
      amountMinor: 500_000,
      moneyAccountId: GTBANK,
      reason: 'Overpaid',
    });
    await service.approve(grace, adjustment.id);
    expect(repo.posted[0]?.lines).toEqual([
      expect.objectContaining({
        ledgerAccountId: 'receivable',
        debitMinor: 500_000,
      }),
      expect.objectContaining({
        ledgerAccountId: 'gtbank-ledger',
        campusId: null,
        creditMinor: 500_000,
      }),
    ]);
  });
});

describe('AdjustmentService.approve activity', () => {
  it.each([
    ['credit_note', 'Reduce a fee', 1_000_000],
    ['write_off', 'Cancel a balance', 1_000_000],
    ['refund', 'Refund', 500_000],
  ] as const)(
    'records one row for an approved %s',
    async (kind, label, amount) => {
      const { repo, service } = setup(kind === 'refund' ? -500_000 : 1_200_000);
      const { adjustment } = await service.create(chika, {
        ...creditNote(),
        kind,
        amountMinor: amount,
        ...(kind === 'refund' ? { moneyAccountId: GTBANK } : {}),
      });

      await service.approve(grace, adjustment.id);

      expect(repo.recorded).toHaveLength(1);
      expect(repo.recorded[0]).toMatchObject({
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'adjustment.approved',
        actorUserId: 'grace',
        subjectType: 'adjustment',
        subjectId: adjustment.id,
        data: {
          adjustmentKind: kind,
          autoApproved: false,
          ownRequest: false,
          amountMinor: amount,
        },
      });
      expect(repo.recorded[0]?.text).toMatch(
        new RegExp(
          String.raw`^${label} ADJ-2026-0001 for Ada Obi, .*, approved by grace\.$`
        )
      );
    }
  );

  it('records nothing when the request was already decided', async () => {
    const { repo, service } = setup();
    const { adjustment } = await service.create(chika, creditNote());
    repo.approveChanges = false;

    await rejected(service.approve(grace, adjustment.id));

    expect(repo.recorded).toEqual([]);
  });
});

describe('AdjustmentService.decline', () => {
  it('keeps the reason and posts nothing', async () => {
    const { repo, service } = setup();
    const { adjustment } = await service.create(chika, creditNote());

    const declined = await service.decline(
      grace,
      adjustment.id,
      ' Not agreed '
    );

    expect(declined).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Not agreed',
    });
    expect(repo.posted).toEqual([]);
    expect(repo.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'adjustment.declined',
        actorUserId: 'grace',
        subjectType: 'adjustment',
        subjectId: adjustment.id,
        text: 'Reduce a fee ADJ-2026-0001 for Ada Obi was declined: Not agreed',
        data: {
          adjustmentId: adjustment.id,
          number: 'ADJ-2026-0001',
          adjustmentKind: 'credit_note',
          studentId: ADA,
          amountMinor: 1_000_000,
        },
      },
    ]);
  });

  it('records nothing for a decline that was refused', async () => {
    const { repo, service } = setup();
    const { adjustment } = await service.create(chika, creditNote());
    await rejected(service.decline(chika, adjustment.id, 'No'));
    await service.decline(grace, adjustment.id, 'No');
    repo.recorded = [];

    await rejected(service.decline(as('yemi'), adjustment.id, 'No'));

    expect(repo.recorded).toEqual([]);
  });

  it('refuses a blank reason with 400', async () => {
    const { service } = setup();
    const { adjustment } = await service.create(chika, creditNote());
    const error = await rejected(service.decline(grace, adjustment.id, '  '));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(DECLINE_REASON_MESSAGE);
  });

  it('answers 409 SelfApproval for the creator, 404 out of scope and 409 once decided', async () => {
    const { service } = setup();
    const { adjustment } = await service.create(chika, creditNote());
    expect(
      (
        (await rejected(
          service.decline(chika, adjustment.id, 'No')
        )) as ConflictException
      ).getResponse()
    ).toMatchObject({ code: 'SelfApproval' });
    expect(await rejected(service.decline(grace, 'nope', 'No'))).toBeInstanceOf(
      NotFoundException
    );
    await service.decline(grace, adjustment.id, 'No');
    expect(
      (
        (await rejected(
          service.decline(as('yemi'), adjustment.id, 'No')
        )) as ConflictException
      ).getResponse()
    ).toMatchObject({ code: 'AlreadyDecided' });
  });
});

describe('AdjustmentService.get and list', () => {
  it('answers 404 for a request outside the finance scope', async () => {
    const { service } = setup();
    expect(await rejected(service.get(chika, 'nope'))).toBeInstanceOf(
      NotFoundException
    );
  });

  it('lists with the school currency', async () => {
    const { service } = setup();
    expect(await service.list(chika, { page: 1, pageSize: 10 })).toEqual({
      currency: 'NGN',
      items: [],
      total: 0,
      waitingCount: 0,
    });
  });
});
