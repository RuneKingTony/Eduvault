import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { KyselyStudentAccountRepository } from './kysely-student-account.repository';
import { StudentAccountController } from './student-account.controller';
import { StudentAccountRepository } from './student-account.repository';
import { StudentAccountService } from './student-account.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [StudentAccountController],
  providers: [
    StudentAccountService,
    {
      provide: StudentAccountRepository,
      useClass: KyselyStudentAccountRepository,
    },
  ],
  exports: [StudentAccountService],
})
export class StudentAccountModule {}
