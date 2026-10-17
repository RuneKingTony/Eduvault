import type {
  ClassTeacher,
  PortalChild,
  PortalStudent,
} from '@eduvault/api-contract';

export interface PortalScope {
  organizationId: string;
  studentScope: readonly string[];
}

export interface PortalProfile {
  name: string;
  username: string | null;
  email: string;
  studentFirstName: string | null;
  school: {
    name: string;
    admissionPrefix: string;
    currency: string;
    logoUrl: string | null;
  };
}

export type PortalStudentRecord = Omit<PortalStudent, 'classTeacherName'> & {
  campusId: string;
  armId: string | null;
};

export abstract class PortalRepository {
  abstract profile(
    organizationId: string,
    userId: string
  ): Promise<PortalProfile | undefined>;

  abstract children(scope: PortalScope): Promise<PortalChild[]>;

  abstract childrenWithBalance(scope: PortalScope): Promise<PortalChild[]>;

  abstract student(
    scope: PortalScope,
    studentId: string
  ): Promise<PortalStudentRecord | undefined>;

  abstract classTeachers(
    organizationId: string,
    armId: string
  ): Promise<ClassTeacher[]>;
}
