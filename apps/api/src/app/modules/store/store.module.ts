import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { DeliveryService } from './delivery.service';
import { ItemService } from './item.service';
import { KyselyStoreRepository } from './kysely-store.repository';
import { StoreController } from './store.controller';
import { StoreRepository } from './store.repository';
import { StoreReadService } from './store-read.service';

@Module({
  imports: [EduvaultAuthModule, LedgerPosterModule],
  controllers: [StoreController],
  providers: [
    ItemService,
    DeliveryService,
    StoreReadService,
    { provide: StoreRepository, useClass: KyselyStoreRepository },
  ],
  exports: [StoreReadService, ItemService, DeliveryService],
})
export class StoreModule {}
