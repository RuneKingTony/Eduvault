import type {
  PaymentMethods,
  PortalPurchases,
  Sale,
  StoreTermFigures,
} from '@eduvault/api-contract';
import type { ProofState } from '../../common/payments';
import {
  SaleRepository,
  type ExistingSale,
  type NewSale,
  type OptionStudents,
  type SaleAccount,
  type SaleOutcome,
  type SalePage,
  type SalePageQuery,
  type SaleStudent,
  type StudentPlacement,
} from './sale.repository';
import type { OrgScope } from '../../common/scope';

export const saleStudent = (
  overrides: Partial<SaleStudent> = {}
): SaleStudent => ({
  id: 'ada',
  name: 'Ada Obi',
  admissionNumber: 'GF-0123',
  life: 'active',
  campusId: 'lekki',
  campusName: 'Lekki',
  className: 'JSS 2 Gold',
  payer: { guardianId: 'ngozi', name: 'Ngozi Obi' },
  ...overrides,
});

export const saleAccount = (
  overrides: Partial<SaleAccount> = {}
): SaleAccount => ({
  id: 'cash-box',
  name: 'Lekki cash box',
  kind: 'cash',
  campusId: 'lekki',
  ledgerAccountId: 'ledger-cash',
  retired: false,
  ...overrides,
});

export const noTermFigures: StoreTermFigures = {
  termSalesMinor: 0,
  termCostMinor: 0,
  termSalesCount: 0,
  termItemsSold: 0,
  termStudentsServed: 0,
};

export class FakeSaleRepository extends SaleRepository {
  students = new Map<string, SaleStudent>();
  accountRows: SaleAccount[] = [];
  methods: PaymentMethods = { cash: true, transfer: true, pos: true };
  term: { id: string; name: string } | undefined = {
    id: 'term-1',
    name: 'First term',
  };
  proofs = new Map<string, ProofState>();
  existing: ExistingSale | undefined;
  stored = new Map<string, Sale>();
  outcome: SaleOutcome = { status: 'recorded', id: 'sale-1' };
  inserted: NewSale[] = [];
  figures: StoreTermFigures = noTermFigures;
  optionRows: OptionStudents = [];
  optionRequests: { today: string; withBalance: boolean }[] = [];
  purchases: PortalPurchases = {
    termName: null,
    spentThisTermMinor: 0,
    termPurchaseCount: 0,
    itemsBought: 0,
    sales: [],
  };
  placement: StudentPlacement | undefined;
  listed: SalePageQuery[] = [];

  findByReference(): Promise<ExistingSale | undefined> {
    return Promise.resolve(this.existing);
  }

  find(_scope: OrgScope, id: string): Promise<Sale | undefined> {
    return Promise.resolve(this.stored.get(id));
  }

  list(_scope: OrgScope, query: SalePageQuery): Promise<SalePage> {
    this.listed.push(query);
    const items = [...this.stored.values()];
    return Promise.resolve({ items, total: items.length });
  }

  student(
    _scope: OrgScope,
    request: { studentId: string }
  ): Promise<SaleStudent | undefined> {
    return Promise.resolve(this.students.get(request.studentId));
  }

  optionStudents(
    _scope: OrgScope,
    request: { today: string; withBalance: boolean }
  ): Promise<OptionStudents> {
    this.optionRequests.push(request);
    return Promise.resolve(this.optionRows);
  }

  currentTerm(): Promise<{ id: string; name: string } | undefined> {
    return Promise.resolve(this.term);
  }

  paymentMethods(): Promise<PaymentMethods> {
    return Promise.resolve(this.methods);
  }

  accounts(): Promise<SaleAccount[]> {
    return Promise.resolve(this.accountRows);
  }

  proofState(
    _organizationId: string,
    _userId: string,
    fileId: string
  ): Promise<ProofState> {
    return Promise.resolve(this.proofs.get(fileId) ?? 'missing');
  }

  insert(input: NewSale): Promise<SaleOutcome> {
    this.inserted.push(input);
    return Promise.resolve(this.outcome);
  }

  termFigures(): Promise<StoreTermFigures> {
    return Promise.resolve(this.figures);
  }

  purchasesOf(): Promise<PortalPurchases> {
    return Promise.resolve(this.purchases);
  }

  placementOf(): Promise<StudentPlacement | undefined> {
    return Promise.resolve(this.placement);
  }
}
