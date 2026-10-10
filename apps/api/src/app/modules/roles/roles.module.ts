import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { KyselyRolesRepository } from './kysely-roles.repository';
import { RolesController } from './roles.controller';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [RolesController],
  providers: [
    RolesService,
    { provide: RolesRepository, useClass: KyselyRolesRepository },
  ],
})
export class RolesModule {}
