import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { FetchMonnifyClient } from './fetch-monnify-client';
import { GatewayConnectionController } from './gateway-connection.controller';
import { GatewayConnectionService } from './gateway-connection.service';
import { GatewayTestService } from './gateway-test.service';
import { GatewaySecrets } from './gateway-secrets';
import { GatewayRepository } from './gateway.repository';
import { KyselyGatewayRepository } from './kysely-gateway.repository';
import { MonnifyClient } from './monnify-client';
import { MonnifyWebhookController } from './monnify-webhook.controller';
import { MonnifyWebhookService } from './monnify-webhook.service';
import { ReservedAccountService } from './reserved-account.service';

@Module({
  imports: [EduvaultAuthModule, LedgerPosterModule, ActivityModule],
  controllers: [GatewayConnectionController, MonnifyWebhookController],
  providers: [
    GatewaySecrets,
    GatewayConnectionService,
    GatewayTestService,
    MonnifyWebhookService,
    ReservedAccountService,
    { provide: GatewayRepository, useClass: KyselyGatewayRepository },
    { provide: MonnifyClient, useClass: FetchMonnifyClient },
  ],
  exports: [ReservedAccountService],
})
export class GatewayModule {}
