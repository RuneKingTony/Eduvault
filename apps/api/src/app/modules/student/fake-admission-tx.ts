import { FakeGuardianTx } from '../../common/people/fake-guardian-tx';
import type { ActivityInput } from '../../common/activity';
import type { NewPortalLogin } from '../../common/auth/portal-login';
import type { NewGuardianRow } from '../../common/people';
import type {
  AdmissionTx,
  NewEnrolmentRow,
  NewStudentRow,
  StudentLoginLink,
} from './admission-tx';

export class FakeAdmissionTx extends FakeGuardianTx implements AdmissionTx {
  number = 234;
  admitted: (NewStudentRow & { id: string })[] = [];
  enrolments: NewEnrolmentRow[] = [];
  linked: StudentLoginLink[] = [];
  steps: string[] = [];

  allocateNumber(): Promise<number> {
    this.steps.push('number');
    return Promise.resolve(this.number);
  }

  insertStudent(row: NewStudentRow): Promise<string> {
    this.steps.push('student');
    const id = this.nextId('student');
    this.admitted.push({ ...row, id });
    return Promise.resolve(id);
  }

  insertEnrolment(row: NewEnrolmentRow): Promise<void> {
    this.steps.push('enrolment');
    this.enrolments.push(row);
    return Promise.resolve();
  }

  linkLogin(link: StudentLoginLink): Promise<void> {
    this.steps.push('link-login');
    this.linked.push(link);
    return Promise.resolve();
  }

  override createLogin(input: NewPortalLogin): Promise<string> {
    this.steps.push(`login:${input.role}`);
    return super.createLogin(input);
  }

  override insertGuardian(row: NewGuardianRow): Promise<string> {
    this.steps.push('guardian');
    return super.insertGuardian(row);
  }

  override recordActivity(input: ActivityInput): Promise<void> {
    this.steps.push('activity');
    return super.recordActivity(input);
  }
}
