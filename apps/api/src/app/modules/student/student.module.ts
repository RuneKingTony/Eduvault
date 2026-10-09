import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { KyselyStudentRepository } from './kysely-student.repository';
import { StudentController } from './student.controller';
import { StudentRepository } from './student.repository';
import { StudentService } from './student.service';

@Module({
  imports: [EduvaultAuthModule, CampusModule],
  controllers: [StudentController],
  providers: [
    StudentService,
    { provide: StudentRepository, useClass: KyselyStudentRepository },
  ],
})
export class StudentModule {}
