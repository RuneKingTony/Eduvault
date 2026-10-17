import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { DeliveryService } from './delivery.service';
import { ItemService } from './item.service';
import { KyselySaleRepository } from './kysely-sale.repository';
import { KyselyStoreRepository } from './kysely-store.repository';
import { SaleController } from './sale.controller';
import { SaleRepository } from './sale.repository';
import { SaleService } from './sale.service';
import { StoreController } from './store.controller';
import { StoreRepository } from './store.repository';
import { StoreReadService } from './store-read.service';

@Module({
  imports: [EduvaultAuthModule, LedgerPosterModule],
  controllers: [StoreController, SaleController],
  providers: [
    ItemService,
    DeliveryService,
    SaleService,
    StoreReadService,
    { provide: StoreRepository, useClass: KyselyStoreRepository },
    { provide: SaleRepository, useClass: KyselySaleRepository },
  ],
  exports: [StoreReadService, ItemService, DeliveryService],
})
export class StoreModule {}
