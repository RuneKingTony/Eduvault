import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { GuardianModule } from '../guardian/guardian.module';
import { AdmissionRepository } from './admission.repository';
import { AdmissionService } from './admission.service';
import { AdmissionsController } from './admissions.controller';
import { KyselyAdmissionRepository } from './kysely-admission.repository';
import { KyselyStudentRepository } from './kysely-student.repository';
import { StudentController } from './student.controller';
import { StudentRepository } from './student.repository';
import { StudentService } from './student.service';

@Module({
  imports: [EduvaultAuthModule, CampusModule, GuardianModule, ActivityModule],
  controllers: [StudentController, AdmissionsController],
  providers: [
    StudentService,
    AdmissionService,
    { provide: StudentRepository, useClass: KyselyStudentRepository },
    { provide: AdmissionRepository, useClass: KyselyAdmissionRepository },
  ],
})
export class StudentModule {}
