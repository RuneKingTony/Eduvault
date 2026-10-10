import { Inject, Injectable } from '@nestjs/common';
import { KYSELY_TOKEN, type Database } from '../db/tokens';
import type { FileStore, StoredFileKey } from './file-store';

/** Keys are file ids: `file_blob` is keyed by the `file_object` it belongs to. */
@Injectable()
export class PostgresFileStore implements FileStore {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {}

  async put(input: StoredFileKey & { bytes: Buffer }): Promise<void> {
    await this.db
      .insertInto('file_blob')
      .values({
        file_id: input.key,
        organization_id: input.organizationId,
        bytes: input.bytes,
      })
      .execute();
  }

  async get(input: StoredFileKey): Promise<Buffer | undefined> {
    const row = await this.db
      .selectFrom('file_blob')
      .select('bytes')
      .where('file_id', '=', input.key)
      .where('organization_id', '=', input.organizationId)
      .executeTakeFirst();
    return row?.bytes;
  }

  async delete(input: StoredFileKey): Promise<void> {
    await this.db
      .deleteFrom('file_blob')
      .where('file_id', '=', input.key)
      .where('organization_id', '=', input.organizationId)
      .execute();
  }
}
