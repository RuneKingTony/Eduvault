import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { KyselySchoolRepository } from './kysely-school.repository';
import { SchoolController } from './school.controller';
import { SchoolRepository } from './school.repository';
import { SchoolService } from './school.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [SchoolController],
  providers: [
    SchoolService,
    { provide: SchoolRepository, useClass: KyselySchoolRepository },
  ],
})
export class SchoolModule {}
