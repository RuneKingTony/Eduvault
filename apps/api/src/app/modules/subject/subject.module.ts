import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { ClassModule } from '../class/class.module';
import { KyselySubjectRepository } from './kysely-subject.repository';
import { LevelSubjectsController } from './level-subjects.controller';
import { SubjectTeacherService } from './subject-teacher.service';
import { SubjectTeachersController } from './subject-teachers.controller';
import { SubjectRepository } from './subject.repository';
import { SubjectService } from './subject.service';
import { SubjectsController } from './subjects.controller';

@Module({
  imports: [EduvaultAuthModule, ClassModule],
  controllers: [
    SubjectsController,
    LevelSubjectsController,
    SubjectTeachersController,
  ],
  providers: [
    SubjectService,
    SubjectTeacherService,
    { provide: SubjectRepository, useClass: KyselySubjectRepository },
  ],
})
export class SubjectModule {}
