import {
  BadRequestException,
  ConflictException,
  Injectable,
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
  fittingSaleAccounts,
  storeSaleNoAccountMessage,
  storeSaleReferenceUsedMessage,
  storeSaleStockShortMessage,
  type PaymentMethod,
  type RecordSale,
  type RecordedSale,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { documentYear } from '../../common/documents';
import { saleRequestHash } from './sale-request-hash';
import {
  SaleRepository,
  type ExistingSale,
  type SaleAccount,
  type SaleLineRequest,
  type SaleOutcome,
  type SaleStudent,
} from './sale.repository';
import { StoreRepository, type StoreRef } from './store.repository';
import { scopeOf, storeInView } from './store-view';

interface Checked {
  student: SaleStudent;
  store: StoreRef;
  termId: string;
  account: SaleAccount;
  proofFileId: string | null;
  lines: SaleLineRequest[];
}

const PROOF_MESSAGES: Partial<Record<PaymentMethod, string>> = {
  pos: STORE_SALE_POS_PROOF_MESSAGE,
  transfer: STORE_SALE_TRANSFER_PROOF_MESSAGE,
};

@Injectable()
export class SaleService {
  constructor(
    private readonly sales: SaleRepository,
    private readonly store: StoreRepository,
    private readonly clock: Clock
  ) {}

  async record(ctx: OrgContext, input: RecordSale): Promise<RecordedSale> {
    const existing = await this.sales.findByReference(
      ctx.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return this.replay(ctx, existing, input);
    }
    const checked = await this.validate(ctx, input);
    const outcome = await this.sales.insert({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      year: documentYear(this.clock),
      today: this.clock.today(),
      reference: input.reference,
      requestHash: saleRequestHash({
        studentId: checked.student.id,
        method: input.method,
        moneyAccountId: checked.account.id,
        lines: input.lines,
      }),
      store: checked.store,
      student: checked.student,
      termId: checked.termId,
      method: input.method,
      account: checked.account,
      proofFileId: checked.proofFileId,
      lines: checked.lines,
    });
    return this.finish(ctx, outcome, {
      reference: input.reference,
      campusName: checked.store.campusName,
    });
  }

  private async finish(
    ctx: OrgContext,
    outcome: SaleOutcome,
    request: { reference: string; campusName: string }
  ): Promise<RecordedSale> {
    switch (outcome.status) {
      case 'recorded':
      case 'replayed': {
        const sale = await this.sales.find(scopeOf(ctx), outcome.id);
        if (sale === undefined) {
          throw new NotFoundException(PAYMENT_STUDENT_NOT_FOUND_MESSAGE);
        }
        return { ...sale, replayed: outcome.status === 'replayed' };
      }
      case 'reference_used': {
        throw new ConflictException(
          storeSaleReferenceUsedMessage(request.reference, outcome.number)
        );
      }
      case 'stock_short': {
        throw new ConflictException(
          storeSaleStockShortMessage(
            outcome.onHand,
            outcome.itemName,
            request.campusName
          )
        );
      }
      case 'posting_clash': {
        throw new ConflictException(STORE_SALE_REFERENCE_TAKEN_MESSAGE);
      }
      case 'proof_taken': {
        throw new ConflictException(PAYMENT_PROOF_TAKEN_MESSAGE);
      }
      case 'student_not_active': {
        throw new ConflictException(STORE_SALE_NOT_ACTIVE_MESSAGE);
      }
      case 'no_term': {
        throw new ConflictException(STORE_SALE_NO_TERM_MESSAGE);
      }
    }
  }

  private async replay(
    ctx: OrgContext,
    existing: ExistingSale,
    input: RecordSale
  ): Promise<RecordedSale> {
    const visible = await this.sales.find(scopeOf(ctx), existing.id);
    if (visible === undefined) {
      throw new ConflictException(STORE_SALE_REFERENCE_TAKEN_MESSAGE);
    }
    const requestHash = saleRequestHash({
      studentId: input.studentId,
      method: input.method,
      moneyAccountId: input.moneyAccountId ?? existing.moneyAccountId,
      lines: input.lines,
    });
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        storeSaleReferenceUsedMessage(input.reference, existing.number)
      );
    }
    return { ...visible, replayed: true };
  }

  private async validate(ctx: OrgContext, input: RecordSale): Promise<Checked> {
    const scope = scopeOf(ctx);
    const student = await this.sales.student(scope, {
      studentId: input.studentId,
      today: this.clock.today(),
    });
    if (student === undefined) {
      throw new NotFoundException(PAYMENT_STUDENT_NOT_FOUND_MESSAGE);
    }
    if (student.life !== 'active') {
      throw new ConflictException(STORE_SALE_NOT_ACTIVE_MESSAGE);
    }
    const term = await this.sales.currentTerm(ctx.organizationId);
    if (term === undefined) {
      throw new ConflictException(STORE_SALE_NO_TERM_MESSAGE);
    }
    await this.checkMethod(ctx, input);
    const proofFileId = await this.checkProof(ctx, input);
    const lines = await this.checkLines(ctx, input);
    const [store, account] = await Promise.all([
      storeInView(this.store, ctx, student.campusId),
      this.resolveAccount(ctx, { input, student }),
    ]);
    return { student, store, termId: term.id, account, proofFileId, lines };
  }

  private async checkMethod(ctx: OrgContext, input: RecordSale): Promise<void> {
    const methods = await this.sales.paymentMethods(ctx.organizationId);
    if (!methods[input.method]) {
      throw new BadRequestException(PAYMENT_METHOD_OFF_MESSAGE);
    }
  }

  private async checkProof(
    ctx: OrgContext,
    input: RecordSale
  ): Promise<string | null> {
    if (input.proofFileId === undefined) {
      const needed = PROOF_MESSAGES[input.method];
      if (needed !== undefined) {
        throw new BadRequestException(needed);
      }
      return null;
    }
    const state = await this.sales.proofState(
      ctx.organizationId,
      ctx.user.id,
      input.proofFileId
    );
    if (state === 'missing') {
      throw new NotFoundException(PAYMENT_PROOF_NOT_FOUND_MESSAGE);
    }
    if (state === 'taken') {
      throw new ConflictException(PAYMENT_PROOF_TAKEN_MESSAGE);
    }
    return input.proofFileId;
  }

  private async checkLines(
    ctx: OrgContext,
    input: RecordSale
  ): Promise<SaleLineRequest[]> {
    const ids = input.lines.map((line) => line.itemId);
    const items = await this.store.findItems(ctx.organizationId, ids);
    const byId = new Map(items.map((item) => [item.id, item]));
    return input.lines.map((line) => {
      const item = byId.get(line.itemId);
      if (item === undefined) {
        throw new NotFoundException(ITEM_NOT_FOUND_MESSAGE);
      }
      if (item.retiredAt !== null) {
        throw new BadRequestException(
          deliveryRetiredItemMessage(item.displayName)
        );
      }
      if (item.sellPriceMinor <= 0) {
        throw new BadRequestException(STORE_SALE_ZERO_PRICE_MESSAGE);
      }
      return {
        itemId: item.id,
        displayName: item.displayName,
        quantity: line.quantity,
        unitPriceMinor: item.sellPriceMinor,
      };
    });
  }

  private async resolveAccount(
    ctx: OrgContext,
    sale: { input: RecordSale; student: SaleStudent }
  ): Promise<SaleAccount> {
    const { input, student } = sale;
    const accounts = await this.sales.accounts(scopeOf(ctx));
    const fits = fittingSaleAccounts(input.method, student.campusId, accounts);
    if (input.moneyAccountId !== undefined) {
      return this.named(input.moneyAccountId, { accounts, fits, sale });
    }
    const [only] = fits;
    if (only === undefined) {
      throw new BadRequestException(
        storeSaleNoAccountMessage(input.method, student.campusName)
      );
    }
    if (fits.length > 1) {
      throw new BadRequestException(STORE_SALE_ACCOUNT_CHOICE_MESSAGE);
    }
    return only;
  }

  private named(
    id: string,
    pick: {
      accounts: readonly SaleAccount[];
      fits: readonly SaleAccount[];
      sale: { input: RecordSale; student: SaleStudent };
    }
  ): SaleAccount {
    if (!pick.accounts.some((account) => account.id === id)) {
      throw new NotFoundException(MONEY_ACCOUNT_NOT_FOUND_MESSAGE);
    }
    const chosen = pick.fits.find((account) => account.id === id);
    if (chosen === undefined) {
      throw new BadRequestException(
        storeSaleNoAccountMessage(
          pick.sale.input.method,
          pick.sale.student.campusName
        )
      );
    }
    return chosen;
  }
}
