import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DISCOUNT_END_AFTER_UNTIL_MESSAGE,
  DISCOUNT_END_PAST_MESSAGE,
  DISCOUNT_FEE_TYPE_MESSAGE,
  DISCOUNT_NOT_APPROVED_MESSAGE,
  DISCOUNT_PAST_TERM_MESSAGE,
  DISCOUNT_PERCENT_MESSAGE,
  DISCOUNT_UNTIL_MESSAGE,
  type CreateStudentDiscount,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { DiscountService } from './discount.service';
import type { TermInfo } from './discount.repository';
import { FakeDiscountRepository } from './fake-discount.repository';

const HALIMA = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';
const TUITION = '2b6d9f10-4c8a-4e7b-9a1c-3d5e7f9b1a2c';

const as = (id: string) =>
  ({
    organizationId: 'school-a',
    user: { id, email: `${id}@eduvault.test`, name: id },
    campusScope: 'all',
  }) as unknown as OrgContext;

const chika = as('chika');
const grace = as('grace');

const term = (id: string, year: number, sequence: number): TermInfo => ({
  id,
  name: `Term ${sequence}, ${year}/${year + 1}`,
  position: { sessionStartsOn: `${year}-09-01`, sequence },
});

const first = term('t1', 2026, 1);
const second = term('t2', 2026, 2);
const third = term('t3', 2026, 3);

function setup() {
  const repo = new FakeDiscountRepository();
  repo.studentsInScope.add(HALIMA);
  repo.feeTypes.add(TUITION);
  for (const entry of [first, second, third]) {
    repo.terms.set(entry.id, entry);
  }
  repo.current = first;
  return { repo, service: new DiscountService(repo) };
}

const scholarship = (
  over: Partial<CreateStudentDiscount> = {}
): CreateStudentDiscount => ({
  studentId: HALIMA,
  kind: 'percent',
  value: 50,
  ledgerAccountId: TUITION,
  fromTermId: 't2',
  reason: 'Scholarship',
  ...over,
});

const rejected = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be refused');
};

const messageOf = (error: unknown) => (error as BadRequestException).message;

describe('DiscountService.create', () => {
  it('saves a waiting discount from a later term, with no activity row', async () => {
    const { repo, service } = setup();
    const result = await service.create(chika, scholarship());
    expect(result.autoApproved).toBe(false);
    expect(result.discount).toMatchObject({
      status: 'submitted',
      kind: 'percent',
      value: 50,
      createdBy: 'chika',
      fromTerm: { id: 't2' },
      toTerm: null,
    });
    expect(repo.recorded).toEqual([]);
  });

  it('takes the current term, a fixed amount on the whole charge and an Until', async () => {
    const { service } = setup();
    const result = await service.create(
      chika,
      scholarship({
        fromTermId: 't1',
        kind: 'fixed',
        value: 1_500_000,
        ledgerAccountId: null,
        toTermId: 't3',
      })
    );
    expect(result.discount).toMatchObject({
      feeType: null,
      toTerm: { id: 't3' },
    });
  });

  it('answers 400 for a percentage above 100', async () => {
    const { service } = setup();
    const error = await rejected(
      service.create(chika, scholarship({ value: 120 }))
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(messageOf(error)).toBe(DISCOUNT_PERCENT_MESSAGE);
  });

  it('answers 400 for a From in a past term', async () => {
    const { repo, service } = setup();
    repo.current = second;
    const error = await rejected(
      service.create(chika, scholarship({ fromTermId: 't1' }))
    );
    expect(messageOf(error)).toBe(DISCOUNT_PAST_TERM_MESSAGE);
  });

  it('answers 400 for an Until before From', async () => {
    const { service } = setup();
    const error = await rejected(
      service.create(chika, scholarship({ fromTermId: 't3', toTermId: 't2' }))
    );
    expect(messageOf(error)).toBe(DISCOUNT_UNTIL_MESSAGE);
  });

  it('answers 400 for a fee type that is not under fee income', async () => {
    const { repo, service } = setup();
    repo.otherAccounts.add(HALIMA);
    const error = await rejected(
      service.create(chika, scholarship({ ledgerAccountId: HALIMA }))
    );
    expect(messageOf(error)).toBe(DISCOUNT_FEE_TYPE_MESSAGE);
  });

  it('answers 404 for a fee type this school does not have', async () => {
    const { service } = setup();
    expect(
      await rejected(
        service.create(chika, scholarship({ ledgerAccountId: HALIMA }))
      )
    ).toBeInstanceOf(NotFoundException);
  });

  it('answers 404 for a student outside the finance scope and for an unknown term', async () => {
    const { service } = setup();
    expect(
      await rejected(service.create(chika, scholarship({ studentId: TUITION })))
    ).toBeInstanceOf(NotFoundException);
    expect(
      await rejected(
        service.create(chika, scholarship({ fromTermId: TUITION }))
      )
    ).toBeInstanceOf(NotFoundException);
    expect(
      await rejected(service.create(chika, scholarship({ toTermId: TUITION })))
    ).toBeInstanceOf(NotFoundException);
  });

  it('approves at once with no approver when discounts are switched off', async () => {
    const { repo, service } = setup();
    repo.switchOn = false;
    const result = await service.create(chika, scholarship());
    expect(result.autoApproved).toBe(true);
    expect(result.discount).toMatchObject({
      status: 'approved',
      approvedBy: null,
    });
    expect(repo.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'discount.approved',
        actorUserId: 'chika',
        subjectType: 'student_discount',
        subjectId: result.discount.id,
        text: 'Discount for Halima Bello (50%) applied by chika.',
        data: {
          discountId: result.discount.id,
          studentId: HALIMA,
          discountKind: 'percent',
          value: 50,
          autoApproved: true,
        },
      },
    ]);
  });
});

describe('DiscountService.approve and decline', () => {
  it('approves a waiting discount, naming the approver, and records one row', async () => {
    const { repo, service } = setup();
    const { discount } = await service.create(chika, scholarship());
    expect(await service.approve(grace, discount.id)).toMatchObject({
      status: 'approved',
      approvedBy: 'grace',
    });
    expect(repo.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'discount.approved',
        actorUserId: 'grace',
        subjectType: 'student_discount',
        subjectId: discount.id,
        text: 'Discount for Halima Bello (50%) approved by grace.',
        data: {
          discountId: discount.id,
          studentId: HALIMA,
          discountKind: 'percent',
          value: 50,
          autoApproved: false,
        },
      },
    ]);
  });

  it('declines with a reason, keeps it and records one row', async () => {
    const { repo, service } = setup();
    const { discount } = await service.create(chika, scholarship());
    expect(
      await service.decline(grace, discount.id, ' Not agreed ')
    ).toMatchObject({ status: 'rejected', rejectionReason: 'Not agreed' });
    expect(repo.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'discount.declined',
        actorUserId: 'grace',
        subjectType: 'student_discount',
        subjectId: discount.id,
        text: 'Discount for Halima Bello was declined: Not agreed',
        data: {
          discountId: discount.id,
          studentId: HALIMA,
          discountKind: 'percent',
          value: 50,
        },
      },
    ]);
  });

  it('records nothing for a second decision or a self-approval', async () => {
    const { repo, service } = setup();
    const { discount } = await service.create(chika, scholarship());
    await rejected(service.approve(chika, discount.id));
    await service.approve(grace, discount.id);
    repo.recorded = [];
    await rejected(service.approve(as('yemi'), discount.id));
    await rejected(service.decline(as('yemi'), discount.id, 'No'));
    expect(repo.recorded).toEqual([]);
  });

  it('refuses a blank decline reason with 400', async () => {
    const { service } = setup();
    const { discount } = await service.create(chika, scholarship());
    expect(
      await rejected(service.decline(grace, discount.id, ' '))
    ).toBeInstanceOf(BadRequestException);
  });

  it('answers 409 SelfApproval for the creator, on both routes', async () => {
    const { service } = setup();
    const { discount } = await service.create(chika, scholarship());
    for (const attempt of [
      service.approve(chika, discount.id),
      service.decline(chika, discount.id, 'No'),
    ]) {
      const error = await rejected(attempt);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SelfApproval',
      });
    }
  });

  it('answers 404 out of scope and 409 AlreadyDecided once decided', async () => {
    const { service } = setup();
    expect(await rejected(service.approve(grace, 'nope'))).toBeInstanceOf(
      NotFoundException
    );
    expect(await rejected(service.decline(grace, 'nope', 'No'))).toBeInstanceOf(
      NotFoundException
    );
    const { discount } = await service.create(chika, scholarship());
    await service.approve(grace, discount.id);
    const again = await rejected(service.approve(as('yemi'), discount.id));
    expect((again as ConflictException).getResponse()).toMatchObject({
      code: 'AlreadyDecided',
    });
  });
});

async function approved(over: Partial<CreateStudentDiscount> = {}) {
  const ctx = setup();
  const { discount } = await ctx.service.create(
    chika,
    scholarship({ fromTermId: 't1', ...over })
  );
  await ctx.service.approve(grace, discount.id);
  return { ...ctx, id: discount.id };
}

describe('DiscountService.end', () => {
  it('sets the last term without approval', async () => {
    const { service, id } = await approved();
    const ended = await service.end(chika, id, { lastTermId: 't2' });
    expect(ended).toMatchObject({ toTerm: { id: 't2' } });
    expect(ended.endedAt).not.toBeNull();
  });

  it('answers 409 when the discount is not approved', async () => {
    const { service } = setup();
    const { discount } = await service.create(chika, scholarship());
    const error = await rejected(
      service.end(chika, discount.id, { lastTermId: 't2' })
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      DISCOUNT_NOT_APPROVED_MESSAGE
    );
  });

  it('answers 400 when the last term is before the current term', async () => {
    const { repo, service, id } = await approved();
    repo.current = second;
    const error = await rejected(service.end(chika, id, { lastTermId: 't1' }));
    expect(messageOf(error)).toBe(DISCOUNT_END_PAST_MESSAGE);
  });

  it('answers 400 when the last term is after the existing Until', async () => {
    const { service, id } = await approved({ toTermId: 't2' });
    const error = await rejected(service.end(chika, id, { lastTermId: 't3' }));
    expect(messageOf(error)).toBe(DISCOUNT_END_AFTER_UNTIL_MESSAGE);
  });

  it('answers 404 for an unknown discount or term', async () => {
    const { service, id } = await approved();
    expect(
      await rejected(service.end(chika, 'nope', { lastTermId: 't2' }))
    ).toBeInstanceOf(NotFoundException);
    expect(
      await rejected(service.end(chika, id, { lastTermId: TUITION }))
    ).toBeInstanceOf(NotFoundException);
  });

  it('answers 409 when the conditional update changes no row', async () => {
    const { repo, service, id } = await approved();
    repo.endChanges = false;
    repo.recorded = [];
    const error = await rejected(service.end(chika, id, { lastTermId: 't2' }));
    expect(error).toBeInstanceOf(ConflictException);
    expect(repo.recorded).toEqual([]);
  });

  it('records one discount.ended row on the student’s campus', async () => {
    const { repo, service, id } = await approved();
    repo.recorded = [];
    await service.end(chika, id, { lastTermId: 't2' });
    expect(repo.recorded).toEqual([
      {
        organizationId: 'school-a',
        campusId: 'lekki',
        pillar: 'finance',
        kind: 'discount.ended',
        actorUserId: 'chika',
        subjectType: 'student_discount',
        subjectId: id,
        text: 'Discount for Halima Bello (50%) ended by chika after Term 2, 2026/2027.',
        data: {
          discountId: id,
          studentId: HALIMA,
          discountKind: 'percent',
          value: 50,
          lastTermId: 't2',
        },
      },
    ]);
  });

  it('records nothing and returns the discount when it already ends at that term', async () => {
    const { repo, service, id } = await approved();
    await service.end(chika, id, { lastTermId: 't2' });
    repo.recorded = [];
    const again = await service.end(chika, id, { lastTermId: 't2' });
    expect(again).toMatchObject({ id, toTerm: { id: 't2' } });
    expect(repo.recorded).toEqual([]);
  });

  it('records a row when an earlier last term replaces the one it ended at', async () => {
    const { repo, service, id } = await approved();
    await service.end(chika, id, { lastTermId: 't2' });
    repo.recorded = [];
    await service.end(chika, id, { lastTermId: 't1' });
    expect(repo.recorded).toHaveLength(1);
  });

  it('records nothing when the discount is not approved', async () => {
    const { repo, service } = setup();
    const { discount } = await service.create(chika, scholarship());
    await rejected(service.end(chika, discount.id, { lastTermId: 't2' }));
    expect(repo.recorded).toEqual([]);
  });
});

describe('DiscountService.list', () => {
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
