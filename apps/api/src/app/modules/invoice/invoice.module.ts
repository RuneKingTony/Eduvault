import { Module } from '@nestjs/common';
import { ActivityModule } from '../../common/activity';
import { EduvaultAuthModule } from '../../common/auth';
import { LedgerPosterModule } from '../../common/ledger';
import { InvoiceController } from './invoice.controller';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';
import { InvoiceWriteRepository } from './invoice-write.repository';
import { KyselyInvoiceRepository } from './kysely-invoice.repository';
import { KyselyInvoiceWriteRepository } from './kysely-invoice-write.repository';

@Module({
  imports: [EduvaultAuthModule, LedgerPosterModule, ActivityModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    { provide: InvoiceRepository, useClass: KyselyInvoiceRepository },
    { provide: InvoiceWriteRepository, useClass: KyselyInvoiceWriteRepository },
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
