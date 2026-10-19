import type {
  StudentCounts,
  StudentDetail,
  StudentRow,
  StudentTab,
  UpdateStudentInput,
} from '@eduvault/api-contract';
import type { CampusClassScope } from '../../common/scope';

export interface StudentListParams {
  tab: StudentTab;
  q?: string;
  campusId?: string;
  levelId?: string;
  page: number;
  pageSize: number;
  withGuardians: boolean;
  withFinance: boolean;
}

export interface StudentDetailTarget {
  id: string;
  withFinance: boolean;
}

export interface StudentListResult {
  items: StudentRow[];
  total: number;
  counts: StudentCounts;
  currency?: string;
}

export abstract class StudentRepository {
  abstract today(organizationId: string): string;

  abstract list(
    organizationId: string,
    scope: CampusClassScope,
    params: StudentListParams
  ): Promise<StudentListResult>;

  abstract findDetail(
    organizationId: string,
    scope: CampusClassScope,
    target: StudentDetailTarget
  ): Promise<StudentDetail | undefined>;

  abstract isVisible(
    organizationId: string,
    scope: CampusClassScope,
    id: string
  ): Promise<boolean>;

  abstract update(
    organizationId: string,
    id: string,
    patch: UpdateStudentInput
  ): Promise<void>;
}
