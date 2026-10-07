import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { SchoolAccountController } from './school-account.controller';
import { SchoolAccountService } from './school-account.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [SchoolAccountController],
  providers: [SchoolAccountService],
})
export class SchoolAccountModule {}
