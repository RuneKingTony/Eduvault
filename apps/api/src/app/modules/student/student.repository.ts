import type { Student } from '@eduvault/api-contract';
import type { CampusScope } from '../../common/campus-scope';

export interface NewStudent {
  campusId: string;
  fullName: string;
  admissionNumber: string;
}

export type StudentPatch = Partial<NewStudent>;

export abstract class StudentRepository {
  abstract list(
    organizationId: string,
    scope: CampusScope,
    campusId?: string
  ): Promise<Student[]>;

  abstract findById(
    organizationId: string,
    scope: CampusScope,
    id: string
  ): Promise<Student | undefined>;

  abstract create(organizationId: string, input: NewStudent): Promise<Student>;

  abstract update(
    organizationId: string,
    id: string,
    patch: StudentPatch
  ): Promise<Student | undefined>;

  abstract remove(organizationId: string, id: string): Promise<void>;
}
