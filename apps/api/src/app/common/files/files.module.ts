import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../auth';
import { ENV_TOKEN, type Env } from '../config/env';
import { FILE_STORE_TOKEN, type FileStore } from './file-store';
import { FileSweepService } from './file-sweep.service';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';
import { KyselyFilesRepository } from './kysely-files.repository';
import { PostgresFileStore } from './postgres-file-store';
import { createS3FileStore } from './s3-file-store';

async function chooseFileStore(
  env: Env,
  postgres: PostgresFileStore
): Promise<FileStore> {
  if (env.FILE_STORE_DRIVER === 'postgres') {
    return postgres;
  }
  const store = createS3FileStore(env);
  await store.verifyBucket();
  return store;
}

@Module({
  imports: [EduvaultAuthModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    FileSweepService,
    PostgresFileStore,
    { provide: FilesRepository, useClass: KyselyFilesRepository },
    {
      provide: FILE_STORE_TOKEN,
      useFactory: chooseFileStore,
      inject: [ENV_TOKEN, PostgresFileStore],
    },
  ],
  exports: [FilesService, FileSweepService],
})
export class FilesModule {}
