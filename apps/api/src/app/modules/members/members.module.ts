import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CampusModule } from '../campus/campus.module';
import { KyselyMembersRepository } from './kysely-members.repository';
import { MembersController } from './members.controller';
import { MembersRepository } from './members.repository';
import { MembersService } from './members.service';

@Module({
  imports: [EduvaultAuthModule, CampusModule],
  controllers: [MembersController],
  providers: [
    MembersService,
    { provide: MembersRepository, useClass: KyselyMembersRepository },
  ],
})
export class MembersModule {}
