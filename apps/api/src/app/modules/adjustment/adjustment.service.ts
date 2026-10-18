import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ADJUSTMENT_ACCOUNT_NOT_ALLOWED_MESSAGE,
  ADJUSTMENT_ACCOUNT_NOT_FOUND_MESSAGE,
  ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE,
  ADJUSTMENT_ACCOUNT_RETIRED_NOW_MESSAGE,
  ADJUSTMENT_CHARGE_MESSAGE,
  ADJUSTMENT_CHARGE_NOT_FOUND_MESSAGE,
  ADJUSTMENT_NOT_FOUND_MESSAGE,
  ADJUSTMENT_STUDENT_NOT_FOUND_MESSAGE,
  PAYMENT_ACCOUNT_GATEWAY_MESSAGE,
  PAYMENT_ACCOUNT_RETIRED_MESSAGE,
  type Adjustment,
  type AdjustmentList,
  type AdjustmentListQuery,
  type CreateAdjustment,
  type CreatedAdjustment,
} from '@eduvault/api-contract';
import {
  adjustmentApprovedActivity,
  adjustmentDeclinedActivity,
  financeActorIn,
  studentFacts,
} from '../../common/activity';
import { assertDeclineReason, decide } from '../../common/approvals';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { documentYear } from '../../common/documents';
import { adjustmentLines, adjustmentMemo } from './adjustment-posting';
import { capProblem } from './adjustment-caps';
import {
  AdjustmentRepository,
  type AdjustmentRecord,
  type AdjustmentScope,
  type AdjustmentTx,
  type StudentFacts,
} from './adjustment.repository';

const scopeOf = (ctx: OrgContext): AdjustmentScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

const notFound = () => new NotFoundException(ADJUSTMENT_NOT_FOUND_MESSAGE);

interface Accounts {
  ledgerAccountId: string | null;
  moneyAccountId: string | null;
  invoiceId: string | null;
}

interface ToPost {
  id: string;
  number: string;
  kind: CreateAdjustment['kind'];
  amountMinor: number;
  reason: string;
  ledgerAccountId: string | null;
  moneyAccountId: string | null;
}

function assertShape(input: CreateAdjustment): void {
  const creditOnly =
    input.ledgerAccountId !== undefined || input.invoiceId !== undefined;
  if (input.kind !== 'credit_note' && creditOnly) {
    throw new BadRequestException(ADJUSTMENT_ACCOUNT_NOT_ALLOWED_MESSAGE);
  }
  if (input.kind !== 'refund' && input.moneyAccountId !== undefined) {
    throw new BadRequestException(ADJUSTMENT_ACCOUNT_NOT_ALLOWED_MESSAGE);
  }
}

async function creditNoteAccounts(
  tx: AdjustmentTx,
  student: StudentFacts,
  input: CreateAdjustment
): Promise<Accounts> {
  const credit = await tx.creditAccount(input.ledgerAccountId ?? null);
  if (credit.status === 'missing') {
    throw new NotFoundException(ADJUSTMENT_ACCOUNT_NOT_FOUND_MESSAGE);
  }
  if (credit.status !== 'ok') {
    throw new BadRequestException(ADJUSTMENT_ACCOUNT_NOT_ALLOWED_MESSAGE);
  }
  if (input.invoiceId !== undefined) {
    const charge = await tx.sentCharge(student.id, input.invoiceId);
    if (charge === 'missing') {
      throw new NotFoundException(ADJUSTMENT_CHARGE_NOT_FOUND_MESSAGE);
    }
    if (charge === 'not_sent') {
      throw new BadRequestException(ADJUSTMENT_CHARGE_MESSAGE);
    }
  }
  return {
    ledgerAccountId: credit.ledgerAccountId,
    moneyAccountId: null,
    invoiceId: input.invoiceId ?? null,
  };
}

async function refundAccounts(
  tx: AdjustmentTx,
  input: CreateAdjustment
): Promise<Accounts> {
  if (input.moneyAccountId === undefined) {
    throw new BadRequestException(ADJUSTMENT_ACCOUNT_REQUIRED_MESSAGE);
  }
  const account = await tx.refundAccount(input.moneyAccountId);
  if (account.status === 'missing') {
    throw new NotFoundException(ADJUSTMENT_ACCOUNT_NOT_FOUND_MESSAGE);
  }
  if (account.status === 'retired') {
    throw new BadRequestException(PAYMENT_ACCOUNT_RETIRED_MESSAGE);
  }
  if (account.status === 'gateway') {
    throw new BadRequestException(PAYMENT_ACCOUNT_GATEWAY_MESSAGE);
  }
  return {
    ledgerAccountId: null,
    moneyAccountId: input.moneyAccountId,
    invoiceId: null,
  };
}

async function accountsAreLive(
  tx: AdjustmentTx,
  found: AdjustmentRecord
): Promise<boolean> {
  if (found.kind === 'refund' && found.moneyAccountId !== null) {
    const money = await tx.moneyAccountPosting(found.moneyAccountId);
    return money?.live === true;
  }
  if (found.kind === 'credit_note' && found.ledgerAccountId !== null) {
    const credit = await tx.creditAccount(found.ledgerAccountId);
    return credit.status === 'ok';
  }
  return true;
}

async function assertAccountsLive(
  tx: AdjustmentTx,
  found: AdjustmentRecord
): Promise<void> {
  if (!(await accountsAreLive(tx, found))) {
    throw new ConflictException(ADJUSTMENT_ACCOUNT_RETIRED_NOW_MESSAGE);
  }
}

function resolveAccounts(
  tx: AdjustmentTx,
  student: StudentFacts,
  input: CreateAdjustment
): Promise<Accounts> {
  assertShape(input);
  switch (input.kind) {
    case 'credit_note': {
      return creditNoteAccounts(tx, student, input);
    }
    case 'refund': {
      return refundAccounts(tx, input);
    }
    case 'write_off': {
      return Promise.resolve({
        ledgerAccountId: null,
        moneyAccountId: null,
        invoiceId: null,
      });
    }
  }
}

@Injectable()
export class AdjustmentService {
  constructor(
    private readonly adjustments: AdjustmentRepository,
    private readonly clock: Clock
  ) {}

  async list(
    ctx: OrgContext,
    query: AdjustmentListQuery
  ): Promise<AdjustmentList> {
    const [currency, page] = await Promise.all([
      this.adjustments.currency(ctx.organizationId),
      this.adjustments.list(scopeOf(ctx), query),
    ]);
    return { currency, ...page };
  }

  async get(ctx: OrgContext, id: string): Promise<Adjustment> {
    return this.item(scopeOf(ctx), id);
  }

  async create(
    ctx: OrgContext,
    input: CreateAdjustment
  ): Promise<CreatedAdjustment> {
    const scope = scopeOf(ctx);
    const year = documentYear(this.clock);
    const made = await this.adjustments.withTx(
      scope,
      ctx.user.id,
      async (tx) => {
        const student = await tx.lockStudent(input.studentId);
        if (student === undefined) {
          throw new NotFoundException(ADJUSTMENT_STUDENT_NOT_FOUND_MESSAGE);
        }
        const problem = capProblem({ ...input, student, moment: 'ask' });
        if (problem !== undefined) {
          throw new BadRequestException(problem);
        }
        const accounts = await resolveAccounts(tx, student, input);
        const row = {
          ...input,
          ...accounts,
          id: randomUUID(),
          number: await tx.nextNumber(year),
        };
        const autoApproved = !(await tx.approvalOn(input.kind));
        const approvedEntryId = autoApproved
          ? await this.post(tx, row, student)
          : null;
        await tx.insert({ ...row, approvedEntryId });
        if (autoApproved) {
          await tx.activity.recordMany(
            adjustmentApprovedActivity(
              await financeActorIn(ctx, tx),
              { ...row, ...studentFacts(student) },
              true
            )
          );
        }
        return { id: row.id, autoApproved };
      }
    );
    return {
      adjustment: await this.item(scope, made.id),
      autoApproved: made.autoApproved,
    };
  }

  async approve(ctx: OrgContext, id: string): Promise<Adjustment> {
    const scope = scopeOf(ctx);
    await this.adjustments.withTx(scope, ctx.user.id, async (tx) => {
      const found = await tx.lockAdjustment(id);
      if (found === undefined) {
        throw notFound();
      }
      await decide(
        { actorId: ctx.user.id, createdBy: found.createdBy },
        async () => {
          if (found.status !== 'submitted') {
            return false;
          }
          const student = await tx.lockStudent(found.studentId);
          if (student === undefined) {
            throw notFound();
          }
          const problem = capProblem({ ...found, student, moment: 'approve' });
          if (problem !== undefined) {
            throw new ConflictException(problem.message);
          }
          await assertAccountsLive(tx, found);
          const changed = await tx.approve(
            id,
            await this.post(tx, found, student)
          );
          if (changed) {
            await tx.activity.recordMany(
              adjustmentApprovedActivity(
                await financeActorIn(ctx, tx),
                { ...found, ...studentFacts(student) },
                false
              )
            );
          }
          return changed;
        }
      );
    });
    return this.item(scope, id);
  }

  async decline(
    ctx: OrgContext,
    id: string,
    reason: string
  ): Promise<Adjustment> {
    const declineReason = assertDeclineReason(reason);
    const scope = scopeOf(ctx);
    await this.adjustments.withTx(scope, ctx.user.id, async (tx) => {
      const found = await tx.lockAdjustment(id);
      if (found === undefined) {
        throw notFound();
      }
      await decide(
        { actorId: ctx.user.id, createdBy: found.createdBy },
        async () => {
          const changed =
            found.status === 'submitted' &&
            (await tx.reject(id, declineReason));
          if (changed) {
            await tx.activity.recordMany(
              adjustmentDeclinedActivity(
                await financeActorIn(ctx, tx),
                { ...found, ...studentFacts(found.student) },
                declineReason
              )
            );
          }
          return changed;
        }
      );
    });
    return this.item(scope, id);
  }

  private async item(scope: AdjustmentScope, id: string): Promise<Adjustment> {
    const found = await this.adjustments.findById(scope, id);
    if (found === undefined) {
      throw notFound();
    }
    return found;
  }

  private async post(
    tx: AdjustmentTx,
    adjustment: ToPost,
    student: StudentFacts
  ): Promise<string> {
    const [accounts, money] = await Promise.all([
      tx.systemAccounts(),
      adjustment.moneyAccountId === null
        ? undefined
        : tx.moneyAccountPosting(adjustment.moneyAccountId),
    ]);
    return tx.post({
      reference: adjustment.number,
      kind: 'adjustment',
      effectiveOn: this.clock.today(),
      memo: adjustmentMemo(adjustment.kind, adjustment.reason),
      sourceId: adjustment.id,
      lines: adjustmentLines({
        kind: adjustment.kind,
        amountMinor: adjustment.amountMinor,
        studentId: student.id,
        studentCampusId: student.campusId,
        receivableId: accounts.receivableId,
        badDebtId: accounts.badDebtId,
        creditNoteAccountId: adjustment.ledgerAccountId,
        money: money ?? null,
      }),
    });
  }
}
