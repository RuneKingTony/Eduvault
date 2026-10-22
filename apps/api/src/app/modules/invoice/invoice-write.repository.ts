import type { OneOffChargeLine } from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';
import type { OrgScope } from '../../common/scope';

export interface ExistingCharge {
  id: string;
  requestHash: string;
  number: string;
  campusId: string;
}

export interface ChargeableStudent {
  id: string;
  name: string;
  campusId: string;
  onRoll: boolean;
}

export interface NewOneOffCharge {
  organizationId: string;
  userId: string;
  userName: string;
  year: number;
  today: string;
  reference: string;
  requestHash: string;
  studentId: string;
  campusScope: CampusScope;
  termId: string;
  lines: readonly OneOffChargeLine[];
}

export type OneOffOutcome =
  | { status: 'created'; id: string }
  | { status: 'replayed'; id: string }
  | { status: 'reference_used'; number: string }
  | { status: 'reference_taken' }
  | { status: 'student_not_found' }
  | { status: 'student_gone' }
  | { status: 'fee_type_not_found' }
  | { status: 'no_term' };

export const distinctFeeTypeIds = (
  lines: readonly OneOffChargeLine[]
): string[] => [...new Set(lines.map((line) => line.feeTypeId))];

export abstract class InvoiceWriteRepository {
  abstract findByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingCharge | undefined>;

  abstract chargeableStudent(
    scope: OrgScope,
    studentId: string
  ): Promise<ChargeableStudent | undefined>;

  abstract activeFeeTypes(
    organizationId: string,
    ids: readonly string[]
  ): Promise<string[]>;

  abstract currentTerm(
    organizationId: string
  ): Promise<{ id: string; name: string } | undefined>;

  abstract createOneOff(input: NewOneOffCharge): Promise<OneOffOutcome>;
}
