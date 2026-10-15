import { Module } from '@nestjs/common';
import { LedgerPoster } from './kysely-ledger-poster';

@Module({ providers: [LedgerPoster], exports: [LedgerPoster] })
export class LedgerPosterModule {}
