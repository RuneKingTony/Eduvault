import type { InvoiceScope } from './invoice.repository';
import {
  InvoiceWriteRepository,
  type ChargeableStudent,
  type ExistingCharge,
  type NewOneOffCharge,
  type OneOffOutcome,
} from './invoice-write.repository';

export const chargeableStudent = (
  overrides: Partial<ChargeableStudent> = {}
): ChargeableStudent => ({
  id: 'ada',
  name: 'Ada Obi',
  campusId: 'lekki',
  onRoll: true,
  ...overrides,
});

export class FakeInvoiceWriteRepository extends InvoiceWriteRepository {
  existing: ExistingCharge | undefined;
  students = new Map<string, ChargeableStudent>();
  feeTypeIds = new Set<string>();
  term: { id: string; name: string } | undefined = {
    id: 'term-1',
    name: 'First term',
  };
  outcome: OneOffOutcome = { status: 'created', id: 'invoice-1' };
  created: NewOneOffCharge[] = [];

  findByReference(): Promise<ExistingCharge | undefined> {
    return Promise.resolve(this.existing);
  }

  chargeableStudent(
    _scope: InvoiceScope,
    studentId: string
  ): Promise<ChargeableStudent | undefined> {
    return Promise.resolve(this.students.get(studentId));
  }

  activeFeeTypes(
    _organizationId: string,
    ids: readonly string[]
  ): Promise<string[]> {
    return Promise.resolve(ids.filter((id) => this.feeTypeIds.has(id)));
  }

  currentTerm(): Promise<{ id: string; name: string } | undefined> {
    return Promise.resolve(this.term);
  }

  createOneOff(input: NewOneOffCharge): Promise<OneOffOutcome> {
    this.created.push(input);
    return Promise.resolve(this.outcome);
  }
}
