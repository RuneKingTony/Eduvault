import type {
  PaymentMethods,
  WalletChild,
  WalletListQuery,
  WalletSummary,
} from '@eduvault/api-contract';
import {
  allocateSpend,
  childSpendable,
  walletFigures,
  type SpendSplit,
} from '@eduvault/shared';
import { canSeeCampus } from '../../common/campus-scope';
import type { UsableMoneyAccount } from '../../common/money-accounts';
import type { ProofState } from '../../common/payments';
import type { OrgScope } from '../../common/scope';
import {
  WalletRepository,
  type EarmarkOutcome,
  type ExistingEntry,
  type MovementPage,
  type NewEarmark,
  type NewSpend,
  type NewTopUp,
  type SpendOutcome,
  type TopUpOutcome,
  type WalletPage,
  type WalletView,
} from './wallet.repository';

export interface FakeChild {
  studentId: string;
  name: string;
  admissionNumber: string;
  campusId: string;
  owedMinor: number;
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
}

interface Earmark {
  walletId: string;
  studentId: string;
  deltaMinor: number;
  reference: string;
  key: string;
}

export class FakeWalletRepository extends WalletRepository {
  wallets: FakeWallet[] = [];
  topUps: (NewTopUp & { id: string })[] = [];
  spends: (NewSpend & { id: string; split: SpendSplit[] })[] = [];
  earmarks: Earmark[] = [];
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

  private figures(wallet: FakeWallet) {
    return walletFigures(
      wallet.balanceMinor,
      [...new Set(wallet.children.map((child) => child.studentId))].map(
        (studentId) => this.marked(wallet.id, studentId)
      )
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
      };
    });
    return {
      id: wallet.id,
      guardian: {
        id: wallet.guardianId,
        name: wallet.name,
        phone: wallet.phone,
      },
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
}
