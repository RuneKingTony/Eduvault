import { Inject, Injectable } from '@nestjs/common';
import {
  moneyAccountKindSchema,
  type PaymentMethods,
  type PortalPurchases,
  type Sale,
  type StoreTermFigures,
} from '@eduvault/api-contract';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { LedgerPoster } from '../../common/ledger';
import { paymentProofState, type ProofState } from '../../common/payments';
import { readPaymentMethods } from '../../common/school-setting/payment-methods';
import {
  findSale,
  findSaleStudent,
  listSales,
  optionStudents,
  placementOf,
  portalPurchases,
  termFigures,
} from './kysely-sale-read.repository';
import {
  findSaleByReference,
  insertSale,
} from './kysely-sale-write.repository';
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
import type { StoreScope } from './store.repository';

@Injectable()
export class KyselySaleRepository extends SaleRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster
  ) {
    super();
  }

  findByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingSale | undefined> {
    return findSaleByReference(this.db, organizationId, reference);
  }

  find(scope: StoreScope, id: string): Promise<Sale | undefined> {
    return findSale(this.db, scope, id);
  }

  list(scope: StoreScope, query: SalePageQuery): Promise<SalePage> {
    return listSales(this.db, scope, query);
  }

  student(
    scope: StoreScope,
    request: { studentId: string; today: string }
  ): Promise<SaleStudent | undefined> {
    return findSaleStudent(this.db, scope, request);
  }

  optionStudents(
    scope: StoreScope,
    request: { today: string; withBalance: boolean }
  ): Promise<OptionStudents> {
    return optionStudents(this.db, scope, request);
  }

  currentTerm(
    organizationId: string
  ): Promise<{ id: string; name: string } | undefined> {
    return this.db
      .selectFrom('term')
      .select(['id', 'name'])
      .where('organization_id', '=', organizationId)
      .where('is_current', '=', true)
      .executeTakeFirst();
  }

  paymentMethods(organizationId: string): Promise<PaymentMethods> {
    return readPaymentMethods(this.db, organizationId);
  }

  async accounts(scope: StoreScope): Promise<SaleAccount[]> {
    const rows = await this.db
      .selectFrom('money_account')
      .select([
        'id',
        'name',
        'kind',
        'campus_id',
        'ledger_account_id',
        'retired_at',
      ])
      .where('organization_id', '=', scope.organizationId)
      .where((eb) =>
        inCampusScope(eb, 'money_account.campus_id', {
          scope: scope.campusScope,
          nullMeans: 'all',
        })
      )
      .orderBy('name')
      .orderBy('id')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: moneyAccountKindSchema.parse(row.kind),
      campusId: row.campus_id,
      ledgerAccountId: row.ledger_account_id,
      retired: row.retired_at !== null,
    }));
  }

  proofState(
    organizationId: string,
    userId: string,
    fileId: string
  ): Promise<ProofState> {
    return paymentProofState(this.db, { organizationId, userId, fileId });
  }

  insert(input: NewSale): Promise<SaleOutcome> {
    return insertSale(this.db, this.poster, input);
  }

  termFigures(scope: StoreScope, campusId?: string): Promise<StoreTermFigures> {
    return termFigures(this.db, scope, campusId);
  }

  purchasesOf(
    organizationId: string,
    studentId: string
  ): Promise<PortalPurchases> {
    return portalPurchases(this.db, { organizationId, studentId });
  }

  placementOf(
    organizationId: string,
    studentId: string
  ): Promise<StudentPlacement | undefined> {
    return placementOf(this.db, { organizationId, studentId });
  }
}
