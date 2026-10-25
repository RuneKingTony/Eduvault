import type {
  ApprovalStatus,
  PaymentMethods,
  WalletApprovalKind,
  WalletChild,
  WalletListQuery,
  WalletRequest,
  WalletRequestListQuery,
  WalletSummary,
} from '@eduvault/api-contract';
import {
  allocateSpend,
  childSpendable,
  walletFigures,
  type SpendSplit,
} from '@eduvault/shared';
import type { WaitingApproval } from '../../common/approvals';
import { canSeeCampus } from '../../common/campus-scope';
import type { UsableMoneyAccount } from '../../common/money-accounts';
import type { ProofState } from '../../common/payments';
import type { OrgScope } from '../../common/scope';
import {
  WalletRepository,
  type ApprovalOutcome,
  type AutoPayOutcome,
  type CancellationRequestOutcome,
  type Declining,
  type DeclineOutcome,
  type Decision,
  type EarmarkOutcome,
  type ExistingEntry,
  type MovementPage,
  type NewAutoPay,
  type NewCancellationRequest,
  type NewEarmark,
  type NewRefundRequest,
  type NewSpend,
  type NewTopUp,
  type PortalMovementPage,
  type RefundApproval,
  type RefundRequestOutcome,
  type RequestPage,
  type RequestRecord,
  type SpendOutcome,
  type TopUpOutcome,
  type TopUpToCancel,
  type WalletPage,
  type WalletView,
} from './wallet.repository';

export interface FakeChild {
  studentId: string;
  name: string;
  admissionNumber: string;
  campusId: string;
  owedMinor: number;
  oldestUnpaidOn?: string;
}

export interface FakeWallet {
  id: string;
  organizationId: string;
  guardianId: string;
  userId: string;
  name: string;
  phone: string;
  paying: boolean;
  balanceMinor: number;
  children: FakeChild[];
  autoPay?: boolean;
}

interface Earmark {
  walletId: string;
  studentId: string;
  deltaMinor: number;
  reference: string;
  key: string;
}

interface FakeRequest {
  kind: WalletApprovalKind;
  id: string;
  organizationId: string;
  walletId: string;
  reference: string;
  requestHash: string;
  reason: string;
  amountMinor: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  rejectionReason: string | null;
  moneyAccountId?: string;
  parentEmail?: string;
  proofFileId?: string;
  payoutReference?: string;
  topUpId?: string;
  topUpReference?: string;
}

export class FakeWalletRepository extends WalletRepository {
  wallets: FakeWallet[] = [];
  topUps: (NewTopUp & { id: string })[] = [];
  spends: (NewSpend & { id: string; split: SpendSplit[] })[] = [];
  earmarks: Earmark[] = [];
  onlineTopUps: { id: string; walletId: string }[] = [];
  requests: FakeRequest[] = [];
  autoPays: (NewAutoPay & { guardianId: string })[] = [];
  accounts = new Map<string, UsableMoneyAccount>();
  proofs = new Map<string, ProofState>();
  methods: PaymentMethods = { cash: true, transfer: true, pos: true };
  private next = 0;

  seed(wallet: FakeWallet): void {
    this.wallets.push(wallet);
  }

  private id(prefix: string): string {
    this.next += 1;
    return `${prefix}-${this.next}`;
  }

  private visible(scope: OrgScope): FakeWallet[] {
    return this.wallets.filter(
      (wallet) =>
        wallet.organizationId === scope.organizationId &&
        (scope.campusScope === 'all' ||
          wallet.children.some((child) =>
            canSeeCampus(scope.campusScope, child.campusId)
          ))
    );
  }

  private marked(walletId: string, studentId?: string): number {
    return this.earmarks
      .filter(
        (row) =>
          row.walletId === walletId &&
          (studentId === undefined || row.studentId === studentId)
      )
      .reduce((total, row) => total + row.deltaMinor, 0);
  }

  private held(walletId: string): number {
    return this.requests
      .filter((row) => row.walletId === walletId && row.status === 'submitted')
      .reduce((total, row) => total + row.amountMinor, 0);
  }

  private figures(wallet: FakeWallet) {
    return walletFigures(
      wallet.balanceMinor,
      [...new Set(wallet.children.map((child) => child.studentId))].map(
        (studentId) => this.marked(wallet.id, studentId)
      ),
      this.held(wallet.id)
    );
  }

  private viewOf(
    wallet: FakeWallet,
    scope: OrgScope['campusScope']
  ): WalletView {
    const figures = this.figures(wallet);
    const children = wallet.children.map((child): WalletChild => {
      const earmarkMinor = this.marked(wallet.id, child.studentId);
      return {
        studentId: child.studentId,
        name: child.name,
        admissionNumber: child.admissionNumber,
        inScope: scope === 'all' || canSeeCampus(scope, child.campusId),
        owedMinor: child.owedMinor,
        earmarkMinor,
        spendableMinor: childSpendable(
          { owedMinor: child.owedMinor, earmarkMinor },
          figures.freeMinor
        ),
        oldestUnpaidOn: child.oldestUnpaidOn ?? null,
      };
    });
    return {
      id: wallet.id,
      guardian: {
        id: wallet.guardianId,
        name: wallet.name,
        phone: wallet.phone,
      },
      reservedAccount: null,
      gatewayConnected: false,
      autoPay: wallet.autoPay ?? false,
      ...figures,
      children,
    };
  }

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  list(scope: OrgScope, query: WalletListQuery): Promise<WalletPage> {
    const needle = (query.q ?? '').toLowerCase();
    const matching = this.visible(scope)
      .filter(
        (wallet) =>
          needle === '' ||
          wallet.name.toLowerCase().includes(needle) ||
          wallet.phone.includes(needle)
      )
      .toSorted((a, b) => a.name.localeCompare(b.name));
    const summaries = matching.map((wallet): WalletSummary => {
      const figures = this.figures(wallet);
      return {
        id: wallet.id,
        guardianId: wallet.guardianId,
        guardianName: wallet.name,
        guardianPhone: wallet.phone,
        childCount: wallet.children.length,
        ...figures,
      };
    });
    const offset = (query.page - 1) * query.pageSize;
    const sum = (pick: (row: WalletSummary) => number) =>
      summaries.reduce((total, row) => total + pick(row), 0);
    return Promise.resolve({
      items: summaries.slice(offset, offset + query.pageSize),
      total: summaries.length,
      totals: {
        walletCount: summaries.length,
        balanceMinor: sum((row) => row.balanceMinor),
        setAsideMinor: sum((row) => row.setAsideMinor),
        heldMinor: sum((row) => row.heldMinor),
        freeMinor: sum((row) => row.freeMinor),
      },
    });
  }

  findWallet(
    scope: OrgScope,
    walletId: string
  ): Promise<WalletView | undefined> {
    const wallet = this.visible(scope).find((row) => row.id === walletId);
    return Promise.resolve(wallet && this.viewOf(wallet, scope.campusScope));
  }

  findOwnWallet(
    organizationId: string,
    userId: string
  ): Promise<WalletView | undefined> {
    const wallet = this.wallets.find(
      (row) => row.organizationId === organizationId && row.userId === userId
    );
    return Promise.resolve(wallet && this.viewOf(wallet, 'all'));
  }

  movements(): Promise<MovementPage> {
    return Promise.resolve({ items: [], total: 0 });
  }

  ownMovements(
    organizationId: string,
    userId: string
  ): Promise<PortalMovementPage | undefined> {
    const wallet = this.wallets.find(
      (row) => row.organizationId === organizationId && row.userId === userId
    );
    return Promise.resolve(wallet && { items: [], total: 0 });
  }

  guardianPays(organizationId: string, walletId: string): Promise<boolean> {
    return Promise.resolve(
      this.wallets.some(
        (row) =>
          row.organizationId === organizationId &&
          row.id === walletId &&
          row.paying
      )
    );
  }

  paymentMethods(): Promise<PaymentMethods> {
    return Promise.resolve(this.methods);
  }

  recordingAccount(
    _scope: OrgScope,
    moneyAccountId: string
  ): Promise<UsableMoneyAccount> {
    return Promise.resolve(
      this.accounts.get(moneyAccountId) ?? { status: 'missing' }
    );
  }

  proof(
    _organizationId: string,
    _userId: string,
    fileId: string
  ): Promise<ProofState> {
    return Promise.resolve(this.proofs.get(fileId) ?? 'missing');
  }

  findTopUp(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined> {
    const row = this.topUps.find(
      (topUp) =>
        topUp.organizationId === organizationId && topUp.reference === reference
    );
    return Promise.resolve(
      row && {
        id: row.id,
        walletId: row.walletId,
        requestHash: row.requestHash,
      }
    );
  }

  findSpend(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined> {
    const row = this.spends.find(
      (spend) =>
        spend.organizationId === organizationId && spend.reference === reference
    );
    return Promise.resolve(
      row && {
        id: row.id,
        walletId: row.walletId,
        requestHash: row.requestHash,
      }
    );
  }

  private walletOf(walletId: string): FakeWallet {
    const wallet = this.wallets.find((row) => row.id === walletId);
    if (wallet === undefined) {
      throw new Error(`No wallet ${walletId}`);
    }
    return wallet;
  }

  async insertTopUp(input: NewTopUp): Promise<TopUpOutcome> {
    const existing = await this.findTopUp(
      input.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return existing.requestHash === input.requestHash
        ? { status: 'replayed', id: existing.id }
        : { status: 'reference_used' };
    }
    if (this.spends.some((spend) => spend.reference === input.reference)) {
      return { status: 'reference_used' };
    }
    if (this.topUps.some((topUp) => topUp.proofFileId === input.proofFileId)) {
      return { status: 'proof_taken' };
    }
    const id = this.id('topup');
    this.topUps.push({ ...input, id });
    this.proofs.set(input.proofFileId, 'taken');
    this.walletOf(input.walletId).balanceMinor += input.amountMinor;
    return { status: 'recorded', id };
  }

  async spend(input: NewSpend): Promise<SpendOutcome> {
    const existing = await this.findSpend(
      input.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return existing.requestHash === input.requestHash
        ? { status: 'replayed', id: existing.id }
        : { status: 'reference_used' };
    }
    if (this.topUps.some((topUp) => topUp.reference === input.reference)) {
      return { status: 'reference_used' };
    }
    const wallet = this.walletOf(input.walletId);
    const { freeMinor } = this.figures(wallet);
    const allocation = allocateSpend(
      input.lines,
      wallet.children.map((child) => ({
        studentId: child.studentId,
        owedMinor: child.owedMinor,
        earmarkMinor: this.marked(wallet.id, child.studentId),
      })),
      freeMinor
    );
    if (!allocation.ok) {
      return {
        status: 'over',
        studentId: allocation.studentId,
        spendableMinor: allocation.spendableMinor,
      };
    }
    const id = this.id('spend');
    this.spends.push({ ...input, id, split: allocation.lines });
    for (const line of allocation.lines) {
      wallet.balanceMinor -= line.amountMinor;
      const child = wallet.children.find(
        (row) => row.studentId === line.studentId
      );
      if (child !== undefined) {
        child.owedMinor -= line.amountMinor;
      }
      if (line.fromEarmarkMinor > 0) {
        this.earmarks.push({
          walletId: wallet.id,
          studentId: line.studentId,
          deltaMinor: -line.fromEarmarkMinor,
          reference: `${input.reference}:earmark:${line.studentId}`,
          key: `spend|${line.studentId}`,
        });
      }
    }
    return { status: 'spent', id };
  }

  earmark(input: NewEarmark): Promise<EarmarkOutcome> {
    const key = [
      input.walletId,
      input.studentId,
      input.kind,
      input.amountMinor,
    ].join('|');
    const existing = this.earmarks.find(
      (row) => row.reference === input.reference
    );
    if (existing !== undefined) {
      return Promise.resolve({
        status: existing.key === key ? 'replayed' : 'reference_used',
      });
    }
    const wallet = this.walletOf(input.walletId);
    const { freeMinor } = this.figures(wallet);
    const limitMinor =
      input.kind === 'set'
        ? Math.max(0, freeMinor)
        : this.marked(wallet.id, input.studentId);
    if (input.amountMinor > limitMinor) {
      return Promise.resolve({ status: 'over', limitMinor });
    }
    this.earmarks.push({
      walletId: wallet.id,
      studentId: input.studentId,
      deltaMinor: input.kind === 'set' ? input.amountMinor : -input.amountMinor,
      reference: input.reference,
      key,
    });
    return Promise.resolve({ status: 'applied' });
  }

  setAutoPay(input: NewAutoPay): Promise<AutoPayOutcome> {
    const wallet = this.walletOf(input.walletId);
    const existing = this.autoPays.find(
      (row) =>
        row.organizationId === input.organizationId &&
        row.reference === input.reference
    );
    if (existing !== undefined) {
      return Promise.resolve({
        status:
          existing.guardianId === wallet.guardianId &&
          existing.enabled === input.enabled
            ? 'replayed'
            : 'reference_used',
      });
    }
    this.autoPays.push({ ...input, guardianId: wallet.guardianId });
    wallet.autoPay = input.enabled;
    return Promise.resolve({ status: 'applied' });
  }

  refundProof(
    _organizationId: string,
    _userId: string,
    fileId: string
  ): Promise<ProofState> {
    return Promise.resolve(this.proofs.get(fileId) ?? 'missing');
  }

  private requestByReference(
    kind: WalletApprovalKind,
    organizationId: string,
    reference: string
  ): ExistingEntry | undefined {
    const row = this.requests.find(
      (request) =>
        request.kind === kind &&
        request.organizationId === organizationId &&
        request.reference === reference
    );
    return (
      row && {
        id: row.id,
        walletId: row.walletId,
        requestHash: row.requestHash,
      }
    );
  }

  findRefundRequest(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined> {
    return Promise.resolve(
      this.requestByReference('wallet_refund', organizationId, reference)
    );
  }

  findCancellationRequest(
    organizationId: string,
    reference: string
  ): Promise<ExistingEntry | undefined> {
    return Promise.resolve(
      this.requestByReference(
        'wallet_topup_cancellation',
        organizationId,
        reference
      )
    );
  }

  findTopUpToCancel(
    scope: OrgScope,
    walletId: string,
    topUpId: string
  ): Promise<TopUpToCancel | undefined> {
    if (!this.visible(scope).some((wallet) => wallet.id === walletId)) {
      return Promise.resolve(undefined);
    }
    const topUp = this.topUps.find(
      (row) => row.id === topUpId && row.walletId === walletId
    );
    if (topUp !== undefined) {
      return Promise.resolve({
        kind: 'staff',
        id: topUp.id,
        reference: topUp.reference,
        amountMinor: topUp.amountMinor,
      });
    }
    return Promise.resolve(
      this.onlineTopUps.some(
        (row) => row.id === topUpId && row.walletId === walletId
      )
        ? { kind: 'online' }
        : undefined
    );
  }

  private createdAt(): string {
    this.next += 1;
    return new Date(Date.UTC(2026, 9, 26, 8, 0, this.next)).toISOString();
  }

  requestRefund(input: NewRefundRequest): Promise<RefundRequestOutcome> {
    const existing = this.requestByReference(
      'wallet_refund',
      input.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return Promise.resolve(
        existing.requestHash === input.requestHash
          ? { status: 'replayed', id: existing.id }
          : { status: 'reference_used' }
      );
    }
    const limitMinor = Math.max(
      0,
      this.figures(this.walletOf(input.walletId)).freeMinor
    );
    if (input.amountMinor > limitMinor) {
      return Promise.resolve({ status: 'over', limitMinor });
    }
    if (this.requests.some((row) => row.proofFileId === input.proofFileId)) {
      return Promise.resolve({ status: 'proof_taken' });
    }
    const id = this.id('refund');
    this.requests.push({
      kind: 'wallet_refund',
      id,
      organizationId: input.organizationId,
      walletId: input.walletId,
      reference: input.reference,
      requestHash: input.requestHash,
      reason: input.reason,
      amountMinor: input.amountMinor,
      createdBy: input.userId,
      createdByName: input.userName,
      createdAt: this.createdAt(),
      status: 'submitted',
      decidedBy: null,
      rejectionReason: null,
      moneyAccountId: input.moneyAccountId,
      parentEmail: input.parentEmail,
      proofFileId: input.proofFileId,
    });
    this.proofs.set(input.proofFileId, 'taken');
    return Promise.resolve({ status: 'requested', id });
  }

  requestCancellation(
    input: NewCancellationRequest
  ): Promise<CancellationRequestOutcome> {
    const existing = this.requestByReference(
      'wallet_topup_cancellation',
      input.organizationId,
      input.reference
    );
    if (existing !== undefined) {
      return Promise.resolve(
        existing.requestHash === input.requestHash
          ? { status: 'replayed', id: existing.id }
          : { status: 'reference_used' }
      );
    }
    if (
      this.requests.some(
        (row) =>
          row.topUpId === input.topUpId &&
          row.kind === 'wallet_topup_cancellation' &&
          row.status !== 'rejected'
      )
    ) {
      return Promise.resolve({ status: 'exists' });
    }
    const topUp = this.topUps.find((row) => row.id === input.topUpId);
    if (topUp === undefined) {
      throw new Error(`No top-up ${input.topUpId}`);
    }
    const { freeMinor } = this.figures(this.walletOf(input.walletId));
    if (freeMinor < topUp.amountMinor) {
      return Promise.resolve({
        status: 'over',
        topUpMinor: topUp.amountMinor,
        freeMinor: Math.max(0, freeMinor),
      });
    }
    const id = this.id('cancel');
    this.requests.push({
      kind: 'wallet_topup_cancellation',
      id,
      organizationId: input.organizationId,
      walletId: input.walletId,
      reference: input.reference,
      requestHash: input.requestHash,
      reason: input.reason,
      amountMinor: topUp.amountMinor,
      createdBy: input.userId,
      createdByName: input.userName,
      createdAt: this.createdAt(),
      status: 'submitted',
      decidedBy: null,
      rejectionReason: null,
      topUpId: input.topUpId,
      topUpReference: topUp.reference,
    });
    return Promise.resolve({ status: 'requested', id });
  }

  private requestView(row: FakeRequest): WalletRequest {
    const base = {
      id: row.id,
      status: row.status,
      reference: row.reference,
      reason: row.reason,
      amountMinor: row.amountMinor,
      wallet: {
        id: row.walletId,
        guardianName: this.walletOf(row.walletId).name,
      },
      createdBy: row.createdByName,
      createdAt: row.createdAt,
      decidedBy: row.decidedBy,
      decidedAt: row.status === 'submitted' ? null : row.createdAt,
      rejectionReason: row.rejectionReason,
    };
    return row.kind === 'wallet_refund'
      ? {
          ...base,
          kind: 'wallet_refund',
          parentEmail: row.parentEmail ?? '',
          moneyAccountName: row.moneyAccountId ?? '',
          payoutReference: row.payoutReference ?? null,
          proofFileId: row.proofFileId ?? '',
        }
      : {
          ...base,
          kind: 'wallet_topup_cancellation',
          topUp: {
            id: row.topUpId ?? '',
            reference: row.topUpReference ?? '',
          },
        };
  }

  private visibleRequests(scope: OrgScope): FakeRequest[] {
    const ids = new Set(this.visible(scope).map((wallet) => wallet.id));
    return this.requests.filter((row) => ids.has(row.walletId));
  }

  findRequest(
    scope: OrgScope,
    kind: WalletApprovalKind,
    id: string
  ): Promise<WalletRequest | undefined> {
    const row = this.visibleRequests(scope).find(
      (request) => request.kind === kind && request.id === id
    );
    return Promise.resolve(row && this.requestView(row));
  }

  requestRecord(
    scope: OrgScope,
    kind: WalletApprovalKind,
    id: string
  ): Promise<RequestRecord | undefined> {
    const row = this.visibleRequests(scope).find(
      (request) => request.kind === kind && request.id === id
    );
    return Promise.resolve(
      row && { status: row.status, createdBy: row.createdBy }
    );
  }

  listRequests(
    scope: OrgScope,
    query: WalletRequestListQuery
  ): Promise<RequestPage> {
    const visible = this.visibleRequests(scope);
    const matching = visible
      .filter(
        (row) =>
          (query.kind === undefined || row.kind === query.kind) &&
          (query.status === undefined || row.status === query.status)
      )
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = (query.page - 1) * query.pageSize;
    return Promise.resolve({
      items: matching
        .slice(offset, offset + query.pageSize)
        .map((row) => this.requestView(row)),
      total: matching.length,
      waitingCount: visible.filter((row) => row.status === 'submitted').length,
    });
  }

  private waitingRow(
    kind: WalletApprovalKind,
    id: string
  ): FakeRequest | undefined {
    return this.requests.find(
      (row) => row.kind === kind && row.id === id && row.status === 'submitted'
    );
  }

  approveRefund(input: RefundApproval): Promise<ApprovalOutcome> {
    const row = this.waitingRow('wallet_refund', input.id);
    if (row === undefined) {
      return Promise.resolve({ status: 'decided' });
    }
    const wallet = this.walletOf(row.walletId);
    if (this.figures(wallet).freeMinor < 0) {
      return Promise.resolve({ status: 'money_gone' });
    }
    const account = this.accounts.get(row.moneyAccountId ?? '');
    if (account?.status !== 'ok' || account.kind !== 'bank') {
      return Promise.resolve({ status: 'account_unusable' });
    }
    if (
      this.requests.some(
        (other) =>
          other.payoutReference === input.payoutReference &&
          other.organizationId === row.organizationId
      )
    ) {
      return Promise.resolve({ status: 'payout_reference_used' });
    }
    row.status = 'approved';
    row.payoutReference = input.payoutReference;
    row.decidedBy = input.userName;
    wallet.balanceMinor -= row.amountMinor;
    return Promise.resolve({ status: 'approved' });
  }

  approveCancellation(input: Decision): Promise<ApprovalOutcome> {
    const row = this.waitingRow('wallet_topup_cancellation', input.id);
    if (row === undefined) {
      return Promise.resolve({ status: 'decided' });
    }
    const wallet = this.walletOf(row.walletId);
    if (this.figures(wallet).freeMinor < 0) {
      return Promise.resolve({ status: 'money_gone' });
    }
    row.status = 'approved';
    row.decidedBy = input.userName;
    wallet.balanceMinor -= row.amountMinor;
    return Promise.resolve({ status: 'approved' });
  }

  declineRequest(
    kind: WalletApprovalKind,
    input: Declining
  ): Promise<DeclineOutcome> {
    const row = this.waitingRow(kind, input.id);
    if (row === undefined) {
      return Promise.resolve({ status: 'decided' });
    }
    row.status = 'rejected';
    row.decidedBy = input.userName;
    row.rejectionReason = input.reason;
    return Promise.resolve({ status: 'declined' });
  }

  waiting(scope: OrgScope): Promise<WaitingApproval[]> {
    return Promise.resolve(
      this.visibleRequests(scope)
        .filter((row) => row.status === 'submitted')
        .map((row) => ({
          kind: row.kind,
          id: row.id,
          details:
            row.kind === 'wallet_refund'
              ? `Refund to ${this.walletOf(row.walletId).name}: ${row.reason}`
              : `Top-up ${row.topUpReference ?? ''} of ${this.walletOf(row.walletId).name}: ${row.reason}`,
          amountMinor: row.amountMinor,
          amountText: null,
          createdById: row.createdBy,
          createdByName: row.createdByName,
          createdAt: row.createdAt,
          campusId: null,
        }))
    );
  }
}
