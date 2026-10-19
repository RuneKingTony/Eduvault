import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  accountTakesMethod,
  PAYMENT_ACCOUNT_GATEWAY_MESSAGE,
  PAYMENT_ACCOUNT_METHOD_MESSAGE,
  PAYMENT_ACCOUNT_NOT_FOUND_MESSAGE,
  PAYMENT_ACCOUNT_RETIRED_MESSAGE,
  PAYMENT_FUTURE_DATE_MESSAGE,
  PAYMENT_GUARDIAN_NOT_FOUND_MESSAGE,
  PAYMENT_METHOD_OFF_MESSAGE,
  PAYMENT_NOT_FOUND_MESSAGE,
  PAYMENT_PROOF_NOT_FOUND_MESSAGE,
  PAYMENT_PROOF_REQUIRED_MESSAGE,
  PAYMENT_PROOF_TAKEN_MESSAGE,
  PAYMENT_PROVIDER_REFERENCE_TAKEN_MESSAGE,
  PAYMENT_REFERENCE_TAKEN_MESSAGE,
  PAYMENT_STUDENT_NOT_FOUND_MESSAGE,
  paymentProviderReferenceUsedMessage,
  paymentReferenceUsedMessage,
  paymentSplitMismatchMessage,
  type Payment,
  type PaymentList,
  type PaymentListQuery,
  type RecordPayment,
  type RecordedPayment,
  type RecordingOptions,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { documentYear } from '../../common/documents';
import { MoneyAccountService } from '../money-account/money-account.service';
import { paymentRequestHash } from '../../common/payments';
import {
  PaymentRepository,
  type ExistingPayment,
  type InsertOutcome,
  type RecordingAccount,
} from './payment.repository';
import { orgScopeOf, type OrgScope } from '../../common/scope';

const sumOf = (rows: readonly { amountMinor: number }[]): number =>
  rows.reduce((total, row) => total + row.amountMinor, 0);

const notFound = () => new NotFoundException(PAYMENT_NOT_FOUND_MESSAGE);

interface Checked {
  ledgerAccountId: string;
  accountCampusId: string | null;
  payerName: string;
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly clock: Clock,
    private readonly moneyAccounts: MoneyAccountService
  ) {}

  async list(ctx: OrgContext, query: PaymentListQuery): Promise<PaymentList> {
    const [currency, page] = await Promise.all([
      this.payments.currency(ctx.organizationId),
      this.payments.list(orgScopeOf(ctx), query),
    ]);
    return { currency, ...page };
  }

  async get(ctx: OrgContext, id: string): Promise<Payment> {
    const [currency, found] = await Promise.all([
      this.payments.currency(ctx.organizationId),
      this.payments.find(orgScopeOf(ctx), id),
    ]);
    if (found === undefined) {
      throw notFound();
    }
    return { currency, ...found };
  }

  async recordingOptions(ctx: OrgContext): Promise<RecordingOptions> {
    const [currency, methods, accounts, people] = await Promise.all([
      this.payments.currency(ctx.organizationId),
      this.payments.paymentMethods(ctx.organizationId),
      this.moneyAccounts.listForRecording(ctx),
      this.payments.recordingPeople(orgScopeOf(ctx)),
    ]);
    return {
      currency,
      today: this.clock.today(),
      accounts,
      methods,
      ...people,
    };
  }

  async record(
    ctx: OrgContext,
    input: RecordPayment
  ): Promise<RecordedPayment> {
    const requestHash = paymentRequestHash(input);
    const existing = await this.payments.findByReference(
      ctx.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return this.replay(ctx, existing, {
        reference: input.reference,
        requestHash,
      });
    }
    const checked = await this.validate(ctx, input);
    const outcome = await this.payments.insert({
      ...checked,
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      year: documentYear(this.clock),
      reference: input.reference,
      requestHash,
      payerGuardianId: input.payerGuardianId ?? null,
      moneyAccountId: input.moneyAccountId,
      method: input.method,
      providerReference: input.providerReference ?? null,
      proofFileId: input.proofFileId ?? null,
      amountMinor: input.amountMinor,
      paidOn: input.paidOn,
      allocations: input.allocations,
    });
    if (outcome.status === 'recorded' || outcome.status === 'replayed') {
      const payment = await this.get(ctx, outcome.id);
      return { ...payment, replayed: outcome.status === 'replayed' };
    }
    throw await this.conflictOf(ctx, outcome, input);
  }

  private async conflictOf(
    ctx: OrgContext,
    outcome: Exclude<InsertOutcome, { status: 'recorded' | 'replayed' }>,
    input: RecordPayment
  ): Promise<ConflictException> {
    switch (outcome.status) {
      case 'reference_used': {
        const receipt = await this.visibleReceipt(
          ctx,
          await this.payments.findByReference(
            ctx.organizationId,
            input.reference
          )
        );
        return new ConflictException(
          receipt === undefined
            ? PAYMENT_REFERENCE_TAKEN_MESSAGE
            : paymentReferenceUsedMessage(input.reference, receipt)
        );
      }
      case 'provider_reference_used': {
        const providerReference = input.providerReference ?? '';
        return this.providerReferenceConflict(
          ctx,
          providerReference,
          await this.payments.findByProviderReference(
            ctx.organizationId,
            providerReference
          )
        );
      }
      case 'proof_taken': {
        return new ConflictException(PAYMENT_PROOF_TAKEN_MESSAGE);
      }
    }
  }

  private async providerReferenceConflict(
    ctx: OrgContext,
    providerReference: string,
    existing: ExistingPayment | undefined
  ): Promise<ConflictException> {
    const receipt = await this.visibleReceipt(ctx, existing);
    return new ConflictException(
      receipt === undefined
        ? PAYMENT_PROVIDER_REFERENCE_TAKEN_MESSAGE
        : paymentProviderReferenceUsedMessage(providerReference, receipt)
    );
  }

  private async visibleReceipt(
    ctx: OrgContext,
    existing: ExistingPayment | undefined
  ): Promise<string | undefined> {
    if (existing === undefined) {
      return undefined;
    }
    const visible = await this.payments.find(orgScopeOf(ctx), existing.id);
    return visible === undefined ? undefined : existing.receiptNumber;
  }

  private async replay(
    ctx: OrgContext,
    existing: ExistingPayment,
    request: { reference: string; requestHash: string }
  ): Promise<RecordedPayment> {
    const visible = await this.payments.find(orgScopeOf(ctx), existing.id);
    if (visible === undefined) {
      throw new ConflictException(PAYMENT_REFERENCE_TAKEN_MESSAGE);
    }
    if (existing.requestHash !== request.requestHash) {
      throw new ConflictException(
        paymentReferenceUsedMessage(request.reference, existing.receiptNumber)
      );
    }
    const currency = await this.payments.currency(ctx.organizationId);
    return { currency, ...visible, replayed: true };
  }

  private async validate(
    ctx: OrgContext,
    input: RecordPayment
  ): Promise<Checked> {
    const scope = orgScopeOf(ctx);
    const methods = await this.payments.paymentMethods(scope.organizationId);
    if (!methods[input.method]) {
      throw new BadRequestException(PAYMENT_METHOD_OFF_MESSAGE);
    }
    if (input.method === 'transfer' && input.proofFileId === undefined) {
      throw new BadRequestException(PAYMENT_PROOF_REQUIRED_MESSAGE);
    }
    if (input.paidOn > this.clock.today()) {
      throw new BadRequestException(PAYMENT_FUTURE_DATE_MESSAGE);
    }
    const split = sumOf(input.allocations);
    if (split !== input.amountMinor) {
      throw new BadRequestException(
        paymentSplitMismatchMessage(split, input.amountMinor)
      );
    }
    const checked = await this.checkPeople(scope, input);
    await this.checkReferences(ctx, input);
    return checked;
  }

  private async usableAccount(
    scope: OrgScope,
    input: RecordPayment
  ): Promise<Extract<RecordingAccount, { status: 'ok' }>> {
    const account = await this.payments.recordingAccount(
      scope,
      input.moneyAccountId
    );
    if (account.status === 'missing') {
      throw new NotFoundException(PAYMENT_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    if (account.status === 'retired') {
      throw new BadRequestException(PAYMENT_ACCOUNT_RETIRED_MESSAGE);
    }
    if (account.status === 'gateway') {
      throw new BadRequestException(PAYMENT_ACCOUNT_GATEWAY_MESSAGE);
    }
    if (!accountTakesMethod(account.kind, input.method)) {
      throw new BadRequestException(PAYMENT_ACCOUNT_METHOD_MESSAGE);
    }
    return account;
  }

  private async checkPeople(
    scope: OrgScope,
    input: RecordPayment
  ): Promise<Checked> {
    const account = await this.usableAccount(scope, input);
    const guardianName =
      input.payerGuardianId === undefined
        ? undefined
        : await this.payments.guardianName(scope, input.payerGuardianId);
    if (input.payerGuardianId !== undefined && guardianName === undefined) {
      throw new NotFoundException(PAYMENT_GUARDIAN_NOT_FOUND_MESSAGE);
    }
    const visible = await this.payments.studentsInScope(
      scope,
      input.allocations.map((row) => row.studentId)
    );
    if (visible.length !== input.allocations.length) {
      throw new NotFoundException(PAYMENT_STUDENT_NOT_FOUND_MESSAGE);
    }
    return {
      ledgerAccountId: account.ledgerAccountId,
      accountCampusId: account.campusId,
      payerName: guardianName ?? input.payerName ?? '',
    };
  }

  private async checkReferences(
    ctx: OrgContext,
    input: RecordPayment
  ): Promise<void> {
    if (input.proofFileId !== undefined) {
      const proof = await this.payments.proof(
        ctx.organizationId,
        ctx.user.id,
        input.proofFileId
      );
      if (proof === 'missing') {
        throw new NotFoundException(PAYMENT_PROOF_NOT_FOUND_MESSAGE);
      }
      if (proof === 'taken') {
        throw new ConflictException(PAYMENT_PROOF_TAKEN_MESSAGE);
      }
    }
    if (input.providerReference !== undefined) {
      const existing = await this.payments.findByProviderReference(
        ctx.organizationId,
        input.providerReference
      );
      if (existing !== undefined) {
        throw await this.providerReferenceConflict(
          ctx,
          input.providerReference,
          existing
        );
      }
    }
  }
}
