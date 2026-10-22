import type {
  EditGuardianInput,
  GuardianDetail,
  GuardianLink,
  GuardianSummary,
} from '@eduvault/api-contract';
import type { GuardianTx, StudentFacts } from '../../common/people';
import type { CampusClassScope } from '../../common/scope';

export interface GuardianPickerQuery {
  q?: string;
  excludeStudentId?: string;
}

export interface VisibleGuardian {
  id: string;
  userId: string;
  fullName: string;
  email: string | null;
  username: string | null;
}

export type PhotoChange =
  | { status: 'changed'; previousFileId: string | null }
  | { status: 'unusable' }
  | { status: 'no-guardian' };

export abstract class GuardianRepository {
  abstract list(
    organizationId: string,
    scope: CampusClassScope,
    query: GuardianPickerQuery
  ): Promise<GuardianSummary[]>;

  abstract findDetail(
    organizationId: string,
    scope: CampusClassScope,
    input: { id: string }
  ): Promise<GuardianDetail | undefined>;

  abstract findVisible(
    organizationId: string,
    scope: CampusClassScope,
    input: { id: string }
  ): Promise<VisibleGuardian | undefined>;

  abstract linksOf(
    organizationId: string,
    scope: CampusClassScope,
    input: { studentId: string }
  ): Promise<GuardianLink[] | undefined>;

  abstract findStudent(
    organizationId: string,
    scope: CampusClassScope,
    input: { studentId: string }
  ): Promise<StudentFacts | undefined>;

  abstract updateDetails(
    organizationId: string,
    id: string,
    patch: Omit<EditGuardianInput, 'photoFileId'>
  ): Promise<void>;

  abstract setPhoto(
    organizationId: string,
    id: string,
    fileId: string | null
  ): Promise<PhotoChange>;

  abstract transaction<T>(fn: (tx: GuardianTx) => Promise<T>): Promise<T>;
}
