import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../auth';
import { FILE_STORE_TOKEN } from './file-store';
import { FileSweepService } from './file-sweep.service';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';
import { KyselyFilesRepository } from './kysely-files.repository';
import { PostgresFileStore } from './postgres-file-store';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    FileSweepService,
    { provide: FilesRepository, useClass: KyselyFilesRepository },
    { provide: FILE_STORE_TOKEN, useClass: PostgresFileStore },
  ],
  exports: [FilesService, FileSweepService],
})
export class FilesModule {}
