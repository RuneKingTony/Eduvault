import { allocateDocumentNumber } from '../../common/documents';
import { KyselyGuardianTx } from '../../common/people';
import type {
  AdmissionTx,
  NewEnrolmentRow,
  NewStudentRow,
  StudentLoginLink,
} from './admission-tx';

export class KyselyAdmissionTx extends KyselyGuardianTx implements AdmissionTx {
  allocateNumber(organizationId: string): Promise<number> {
    return allocateDocumentNumber(this.db, {
      organizationId,
      kind: 'admission',
      year: null,
    });
  }

  async insertStudent(row: NewStudentRow): Promise<string> {
    const inserted = await this.db
      .insertInto('student')
      .values({
        organization_id: row.organizationId,
        campus_id: row.campusId,
        first_name: row.firstName,
        last_name: row.lastName,
        gender: row.gender,
        date_of_birth: row.dateOfBirth,
        admission_number: row.admissionNumber,
        admitted_on: row.admittedOn,
        created_by: row.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return inserted.id;
  }

  async insertEnrolment(row: NewEnrolmentRow): Promise<void> {
    const enrolment = await this.db
      .insertInto('student_enrollment')
      .values({
        organization_id: row.organizationId,
        student_id: row.studentId,
        session_id: row.sessionId,
        class_level_id: row.levelId,
        status: 'active',
        is_new_student: true,
        created_by: row.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.db
      .insertInto('enrollment_placement')
      .values({
        organization_id: row.organizationId,
        enrollment_id: enrolment.id,
        term_id: row.termId,
        class_arm_id: row.classArmId,
        campus_id: row.campusId,
        created_by: row.createdBy,
      })
      .execute();
  }

  async linkLogin(link: StudentLoginLink): Promise<void> {
    await this.db
      .updateTable('student')
      .set({ user_id: link.userId })
      .where('id', '=', link.studentId)
      .where('organization_id', '=', link.organizationId)
      .execute();
  }
}
