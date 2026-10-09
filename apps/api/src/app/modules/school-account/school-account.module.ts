import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { KyselySchoolAccountRepository } from './kysely-school-account.repository';
import { SchoolAccountController } from './school-account.controller';
import { SchoolAccountRepository } from './school-account.repository';
import { SchoolAccountService } from './school-account.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [SchoolAccountController],
  providers: [
    SchoolAccountService,
    {
      provide: SchoolAccountRepository,
      useClass: KyselySchoolAccountRepository,
    },
  ],
})
export class SchoolAccountModule {}
