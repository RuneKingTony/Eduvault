import type {
  PortalChild,
  PortalFamilyStatement,
  PortalKind,
  PortalStatement,
} from '@eduvault/api-contract';
import { isPlaceholderEmail } from '@eduvault/shared';
import { familyTotals } from '../../common/ledger';
import type { OwnStatement } from '../student-account/student-account.service';
import type { PortalStudentRecord } from './portal.repository';

export const portalKindOf = (hasStudentRow: boolean): PortalKind =>
  hasStudentRow ? 'student' : 'guardian';

export const realEmail = (email: string): string | null =>
  isPlaceholderEmail(email) ? null : email;

export const firstNameOf = (
  name: string,
  studentFirstName: string | null
): string => studentFirstName ?? name.trim().split(' ')[0] ?? name;

const fullName = (person: { firstName: string; lastName: string }): string =>
  `${person.firstName} ${person.lastName}`;

export function toPortalStatement(
  student: PortalStudentRecord,
  own: OwnStatement
): PortalStatement {
  return {
    currency: own.currency,
    student: {
      id: student.id,
      name: fullName(student),
      admissionNumber: student.admissionNumber,
      className: student.className,
      campusName: student.campusName,
      archived: student.archived,
    },
    totals: own.totals,
    rows: own.rows.map(({ effectiveOn, description, status, amountMinor }) => ({
      effectiveOn,
      description,
      status,
      amountMinor,
    })),
    total: own.total,
    page: own.page,
    pageSize: own.pageSize,
    unpaid: own.unpaid.map(({ reference, outstandingMinor }) => ({
      number: reference,
      outstandingMinor,
    })),
  };
}

export function toPortalFamilyStatement(
  currency: string,
  children: readonly PortalChild[],
  balances: ReadonlyMap<string, number>
): PortalFamilyStatement {
  const rows = children.map((child) => ({
    studentId: child.id,
    name: fullName(child),
    className: child.className,
    campusName: child.campusName,
    archived: child.archived,
    balanceMinor: balances.get(child.id) ?? 0,
  }));
  const { owedMinor, creditMinor } = familyTotals(
    rows.map((row) => row.balanceMinor)
  );
  return {
    currency,
    totalOwedMinor: owedMinor,
    creditMinor,
    children: rows,
  };
}
