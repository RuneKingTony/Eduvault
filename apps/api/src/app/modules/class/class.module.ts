import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { ClassLevelService } from './class-level.service';
import { ClassLevelsController } from './class-levels.controller';
import { ClassRepository } from './class.repository';
import { ClassService } from './class.service';
import { ClassesController } from './classes.controller';
import { KyselyClassRepository } from './kysely-class.repository';

@Module({
  imports: [EduvaultAuthModule, CampusModule],
  controllers: [ClassLevelsController, ClassesController],
  providers: [
    ClassService,
    ClassLevelService,
    { provide: ClassRepository, useClass: KyselyClassRepository },
  ],
  exports: [ClassService],
})
export class ClassModule {}
