import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  STUDENT_NOT_FOUND_MESSAGE,
  STUDENT_NO_LOGIN_MESSAGE,
  STUDENT_SHARED_RESET_MESSAGE,
  studentGoneMessage,
  type ResetLogin,
} from '@eduvault/api-contract';
import {
  AccountService,
  generateTemporaryPassword,
  type OrgContext,
} from '../../common/auth';
import { LifecycleRunner } from './lifecycle-runner';

@Injectable()
export class StudentLoginService {
  constructor(
    private readonly runner: LifecycleRunner,
    private readonly accounts: AccountService
  ) {}

  async resetLogin(ctx: OrgContext, id: string): Promise<ResetLogin> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.accounts.hashPassword(temporaryPassword);
    const detail = await this.runner.run(ctx, id, async (tx, student) => {
      const name = `${student.firstName} ${student.lastName}`;
      if (student.exitKind !== null) {
        throw new ConflictException(studentGoneMessage(name));
      }
      if (student.userId === null) {
        throw new ConflictException(STUDENT_NO_LOGIN_MESSAGE);
      }
      const outcome = await tx.resetLogin({
        organizationId: ctx.organizationId,
        userId: student.userId,
        passwordHash,
      });
      if (outcome === 'missing') {
        throw new NotFoundException(STUDENT_NOT_FOUND_MESSAGE);
      }
      if (outcome === 'shared') {
        throw new ConflictException(STUDENT_SHARED_RESET_MESSAGE);
      }
      await tx.record({
        organizationId: ctx.organizationId,
        campusId: student.campusId,
        pillar: 'access',
        kind: 'student.login_reset',
        actorUserId: ctx.user.id,
        subjectType: 'student',
        subjectId: student.id,
        text: `${ctx.user.name} reset ${name}’s login.`,
        data: { studentId: student.id },
      });
    });
    return {
      username: detail.portalLogin?.username,
      temporaryPassword,
    };
  }
}
