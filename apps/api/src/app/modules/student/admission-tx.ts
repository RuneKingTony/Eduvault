import type { GuardianTx } from '../../common/people';

export interface NewStudentRow {
  organizationId: string;
  campusId: string;
  firstName: string;
  lastName: string;
  gender: 'F' | 'M';
  dateOfBirth: string;
  admissionNumber: string;
  admittedOn: string;
  createdBy: string;
}

export interface NewEnrolmentRow {
  organizationId: string;
  studentId: string;
  sessionId: string;
  levelId: string;
  termId: string;
  classArmId: string;
  campusId: string;
  createdBy: string;
}

export interface StudentLoginLink {
  organizationId: string;
  studentId: string;
  userId: string;
}

export interface AdmissionTx extends GuardianTx {
  allocateNumber(organizationId: string): Promise<number>;
  insertStudent(row: NewStudentRow): Promise<string>;
  insertEnrolment(row: NewEnrolmentRow): Promise<void>;
  linkLogin(link: StudentLoginLink): Promise<void>;
}
