import type {
  StudentCounts,
  StudentDetail,
  StudentRow,
  StudentTab,
  UpdateStudentInput,
} from '@eduvault/api-contract';
import type { StudentScope } from './visibility';

export interface StudentListParams {
  tab: StudentTab;
  q?: string;
  campusId?: string;
  levelId?: string;
  page: number;
  pageSize: number;
  withGuardians: boolean;
}

export interface StudentListResult {
  items: StudentRow[];
  total: number;
  counts: StudentCounts;
}

export abstract class StudentRepository {
  abstract list(
    organizationId: string,
    scope: StudentScope,
    params: StudentListParams
  ): Promise<StudentListResult>;

  abstract findDetail(
    organizationId: string,
    scope: StudentScope,
    id: string
  ): Promise<StudentDetail | undefined>;

  abstract isVisible(
    organizationId: string,
    scope: StudentScope,
    id: string
  ): Promise<boolean>;

  abstract update(
    organizationId: string,
    id: string,
    patch: UpdateStudentInput
  ): Promise<void>;
}
