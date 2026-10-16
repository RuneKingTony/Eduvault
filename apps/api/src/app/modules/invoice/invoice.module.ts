import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { InvoiceController } from './invoice.controller';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';
import { KyselyInvoiceRepository } from './kysely-invoice.repository';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    { provide: InvoiceRepository, useClass: KyselyInvoiceRepository },
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
