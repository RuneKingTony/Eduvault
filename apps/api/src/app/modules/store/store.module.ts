import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import {
  ApprovalRegistryModule,
  registerApprovals,
} from '../../common/approvals';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { DeliveryService } from './delivery.service';
import { ItemService } from './item.service';
import { KyselySaleRepository } from './kysely-sale.repository';
import { KyselyStockCountRepository } from './kysely-stock-count.repository';
import { KyselyStoreRepository } from './kysely-store.repository';
import { SaleController } from './sale.controller';
import { SaleRepository } from './sale.repository';
import { SaleService } from './sale.service';
import { StockCountController } from './stock-count.controller';
import { StockCountRepository } from './stock-count.repository';
import { StockCountService } from './stock-count.service';
import { StoreController } from './store.controller';
import { StoreRepository } from './store.repository';
import { StoreReadService } from './store-read.service';

@Module({
  imports: [
    EduvaultAuthModule,
    LedgerPosterModule,
    ApprovalRegistryModule,
    ActivityModule,
  ],
  controllers: [StoreController, SaleController, StockCountController],
  providers: [
    ItemService,
    DeliveryService,
    SaleService,
    StockCountService,
    StoreReadService,
    { provide: StoreRepository, useClass: KyselyStoreRepository },
    { provide: SaleRepository, useClass: KyselySaleRepository },
    { provide: StockCountRepository, useClass: KyselyStockCountRepository },
    registerApprovals(StockCountRepository),
  ],
  exports: [StoreReadService, ItemService, DeliveryService],
})
export class StoreModule {}
