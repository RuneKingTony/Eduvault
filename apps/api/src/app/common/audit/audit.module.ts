import { Module } from '@nestjs/common';
import { ActingAuditMiddleware } from './acting-audit.middleware';
import { AuditRepository } from './audit.repository';
import { KyselyAuditRepository } from './kysely-audit.repository';

@Module({
  providers: [
    ActingAuditMiddleware,
    { provide: AuditRepository, useClass: KyselyAuditRepository },
  ],
  exports: [ActingAuditMiddleware, AuditRepository],
})
export class AuditModule {}
