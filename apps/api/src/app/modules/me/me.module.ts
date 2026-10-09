import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { KyselyMeRepository } from './kysely-me.repository';
import { MeController } from './me.controller';
import { MeRepository } from './me.repository';
import { MeService } from './me.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [MeController],
  providers: [
    MeService,
    { provide: MeRepository, useClass: KyselyMeRepository },
  ],
})
export class MeModule {}
