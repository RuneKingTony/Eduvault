import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FEE_TYPE_NOT_FOUND_MESSAGE,
  INVOICE_NOT_FOUND_MESSAGE,
  INVOICE_NO_TERM_MESSAGE,
  INVOICE_REFERENCE_TAKEN_MESSAGE,
  INVOICE_STUDENT_NOT_FOUND_MESSAGE,
  INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE,
  invoiceReferenceUsedMessage,
  type CreateOneOffCharge,
  type CreatedCharge,
  type Invoice,
  type InvoiceList,
  type InvoiceListQuery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { canSeeCampus } from '../../common/campus-scope';
import { Clock } from '../../common/clock';
import { documentYear } from '../../common/documents';
import { chargeRequestHash } from '../../common/fees';
import { balanceToday, broughtForward } from '../../common/ledger';
import { InvoiceRepository } from './invoice.repository';
import {
  distinctFeeTypeIds,
  InvoiceWriteRepository,
  type ExistingCharge,
  type OneOffOutcome,
} from './invoice-write.repository';
import { orgScopeOf } from '../../common/scope';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly writes: InvoiceWriteRepository,
    private readonly clock: Clock
  ) {}

  async listPage(
    ctx: OrgContext,
    query: InvoiceListQuery
  ): Promise<Omit<InvoiceList, 'counts' | 'summary'>> {
    const scope = orgScopeOf(ctx);
    if (
      query.studentId !== undefined &&
      !(await this.invoices.studentVisible(scope, query.studentId))
    ) {
      throw new NotFoundException(INVOICE_STUDENT_NOT_FOUND_MESSAGE);
    }
    const [currency, page] = await Promise.all([
      this.invoices.currency(ctx.organizationId),
      this.invoices.list(scope, query),
    ]);
    return { currency, ...page };
  }

  async list(ctx: OrgContext, query: InvoiceListQuery): Promise<InvoiceList> {
    const scope = orgScopeOf(ctx);
    const [page, counts, summary] = await Promise.all([
      this.listPage(ctx, query),
      this.invoices.counts(scope),
      this.invoices.summary(scope),
    ]);
    return { ...page, counts, summary };
  }

  async chargedIn(
    ctx: OrgContext,
    termId: string
  ): Promise<{ currency: string; count: number; totalMinor: number }> {
    const [currency, totals] = await Promise.all([
      this.invoices.currency(ctx.organizationId),
      this.invoices.termTotals(orgScopeOf(ctx), termId),
    ]);
    return { currency, ...totals };
  }

  async get(ctx: OrgContext, id: string): Promise<Invoice> {
    const record = await this.invoices.find(orgScopeOf(ctx), id);
    if (record === undefined) {
      throw new NotFoundException(INVOICE_NOT_FOUND_MESSAGE);
    }
    const [currency, movements] = await Promise.all([
      this.invoices.currency(ctx.organizationId),
      this.invoices.movements(ctx.organizationId, record.student.id),
    ]);
    const { entrySequence, ...invoice } = record;
    const today = balanceToday(movements);
    const before =
      entrySequence === null ? today : broughtForward(movements, entrySequence);
    return {
      ...invoice,
      currency,
      broughtForwardMinor: before,
      dueAtIssueMinor: before + record.totalMinor,
      balanceTodayMinor: today,
    };
  }

  async create(
    ctx: OrgContext,
    input: CreateOneOffCharge
  ): Promise<CreatedCharge> {
    const existing = await this.writes.findByReference(
      ctx.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return this.replay(ctx, existing, input);
    }
    const termId = await this.validate(ctx, input);
    const outcome = await this.writes.createOneOff({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      year: documentYear(this.clock),
      today: this.clock.today(),
      reference: input.reference,
      requestHash: chargeRequestHash(input),
      studentId: input.studentId,
      campusScope: ctx.campusScope,
      termId,
      lines: input.lines,
    });
    return this.finish(ctx, outcome, input.reference);
  }

  private async replay(
    ctx: OrgContext,
    existing: ExistingCharge,
    input: CreateOneOffCharge
  ): Promise<CreatedCharge> {
    if (!canSeeCampus(ctx.campusScope, existing.campusId)) {
      throw new ConflictException(INVOICE_REFERENCE_TAKEN_MESSAGE);
    }
    if (existing.requestHash !== chargeRequestHash(input)) {
      throw new ConflictException(
        invoiceReferenceUsedMessage(input.reference, existing.number)
      );
    }
    return { ...(await this.get(ctx, existing.id)), replayed: true };
  }

  private async validate(
    ctx: OrgContext,
    input: CreateOneOffCharge
  ): Promise<string> {
    const student = await this.writes.chargeableStudent(
      orgScopeOf(ctx),
      input.studentId
    );
    if (student === undefined) {
      throw new NotFoundException(INVOICE_STUDENT_NOT_FOUND_MESSAGE);
    }
    if (!student.onRoll) {
      throw new ConflictException(INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE);
    }
    const feeTypeIds = distinctFeeTypeIds(input.lines);
    const found = await this.writes.activeFeeTypes(
      ctx.organizationId,
      feeTypeIds
    );
    if (found.length !== feeTypeIds.length) {
      throw new NotFoundException(FEE_TYPE_NOT_FOUND_MESSAGE);
    }
    const term = await this.writes.currentTerm(ctx.organizationId);
    if (term === undefined) {
      throw new ConflictException(INVOICE_NO_TERM_MESSAGE);
    }
    return term.id;
  }

  private async finish(
    ctx: OrgContext,
    outcome: OneOffOutcome,
    reference: string
  ): Promise<CreatedCharge> {
    switch (outcome.status) {
      case 'created':
      case 'replayed': {
        return {
          ...(await this.get(ctx, outcome.id)),
          replayed: outcome.status === 'replayed',
        };
      }
      case 'reference_used': {
        throw new ConflictException(
          invoiceReferenceUsedMessage(reference, outcome.number)
        );
      }
      case 'reference_taken': {
        throw new ConflictException(INVOICE_REFERENCE_TAKEN_MESSAGE);
      }
      case 'student_not_found': {
        throw new NotFoundException(INVOICE_STUDENT_NOT_FOUND_MESSAGE);
      }
      case 'fee_type_not_found': {
        throw new NotFoundException(FEE_TYPE_NOT_FOUND_MESSAGE);
      }
      case 'student_gone': {
        throw new ConflictException(INVOICE_STUDENT_NOT_ON_ROLL_MESSAGE);
      }
      case 'no_term': {
        throw new ConflictException(INVOICE_NO_TERM_MESSAGE);
      }
    }
  }
}
