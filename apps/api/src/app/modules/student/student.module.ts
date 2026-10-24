import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { ClassModule } from '../class/class.module';
import { GatewayModule } from '../gateway/gateway.module';
import { GuardianModule } from '../guardian/guardian.module';
import { AdmissionRepository } from './admission.repository';
import { AdmitWithAccountService } from './admit-with-account.service';
import { AdmissionService } from './admission.service';
import { AdmissionsController } from './admissions.controller';
import { GraduationController } from './graduation.controller';
import { GraduationService } from './graduation.service';
import { KyselyAdmissionRepository } from './kysely-admission.repository';
import { KyselyLifecycleRepository } from './kysely-lifecycle.repository';
import { KyselyNewSchoolYearRepository } from './kysely-new-school-year.repository';
import { KyselyStudentRepository } from './kysely-student.repository';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleRepository } from './lifecycle.repository';
import { LifecycleRunner } from './lifecycle-runner';
import { LifecycleService } from './lifecycle.service';
import { NewSchoolYearController } from './new-school-year.controller';
import { NewSchoolYearRepository } from './new-school-year.repository';
import { NewSchoolYearService } from './new-school-year.service';
import { StudentController } from './student.controller';
import { StudentListService } from './student-list.service';
import { StudentLoginService } from './student-login.service';
import { StudentRepository } from './student.repository';
import { StudentService } from './student.service';

@Module({
  imports: [
    EduvaultAuthModule,
    CampusModule,
    ClassModule,
    GuardianModule,
    ActivityModule,
    GatewayModule,
  ],
  controllers: [
    NewSchoolYearController,
    StudentController,
    LifecycleController,
    GraduationController,
    AdmissionsController,
  ],
  providers: [
    StudentService,
    StudentListService,
    StudentLoginService,
    AdmissionService,
    AdmitWithAccountService,
    LifecycleRunner,
    LifecycleService,
    GraduationService,
    NewSchoolYearService,
    { provide: StudentRepository, useClass: KyselyStudentRepository },
    { provide: LifecycleRepository, useClass: KyselyLifecycleRepository },
    {
      provide: NewSchoolYearRepository,
      useClass: KyselyNewSchoolYearRepository,
    },
    { provide: AdmissionRepository, useClass: KyselyAdmissionRepository },
  ],
  exports: [NewSchoolYearService],
})
export class StudentModule {}
