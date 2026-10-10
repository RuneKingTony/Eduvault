import { Inject, Injectable } from '@nestjs/common';
import type {
  Expression,
  ExpressionBuilder,
  Selectable,
  SqlBool,
} from 'kysely';
import type { FileKind } from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { KYSELY_TOKEN, type Database } from '../db/tokens';
import {
  FilesRepository,
  type FileRecord,
  type NewFile,
} from './files.repository';

type FileEntry = ExpressionBuilder<DB, 'file_object'>;
type FileRow = Selectable<DB['file_object']>;

const toRecord = (row: FileRow): FileRecord => ({
  id: row.id,
  organizationId: row.organization_id,
  kind: row.kind as FileKind,
  storageKey: row.storage_key,
  contentType: row.content_type,
  byteSize: row.byte_size,
  originalName: row.original_name,
});

const OWNED_BY: Record<FileKind, (eb: FileEntry) => Expression<SqlBool>> = {
  school_logo: (eb) =>
    eb.exists(
      eb
        .selectFrom('school_account')
        .select('school_account.id')
        .whereRef('school_account.logo_file_id', '=', 'file_object.id')
    ),
};

@Injectable()
export class KyselyFilesRepository extends FilesRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async insert(input: NewFile): Promise<void> {
    await this.db
      .insertInto('file_object')
      .values({
        id: input.id,
        organization_id: input.organizationId,
        kind: input.kind,
        storage_key: input.storageKey,
        content_type: input.contentType,
        byte_size: input.byteSize,
        sha256: input.sha256,
        original_name: input.originalName,
        uploaded_by: input.uploadedBy,
      })
      .execute();
  }

  async findById(
    organizationId: string,
    id: string
  ): Promise<FileRecord | undefined> {
    const row = await this.db
      .selectFrom('file_object')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row && toRecord(row);
  }

  async isAttached(file: FileRecord): Promise<boolean> {
    const row = await this.db
      .selectFrom('file_object')
      .select('id')
      .where('id', '=', file.id)
      .where('organization_id', '=', file.organizationId)
      .where(OWNED_BY[file.kind])
      .executeTakeFirst();
    return row !== undefined;
  }

  async delete(organizationId: string, id: string): Promise<void> {
    await this.db
      .deleteFrom('file_object')
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async deleteOrphansUploadedBefore(cutoff: Date): Promise<number> {
    const removed = await this.db
      .deleteFrom('file_object')
      .where('uploaded_at', '<', cutoff)
      .where((eb) =>
        eb.not(
          eb.or(
            Object.entries(OWNED_BY).map(([kind, owned]) =>
              eb.and([eb('file_object.kind', '=', kind), owned(eb)])
            )
          )
        )
      )
      .returning('id')
      .execute();
    return removed.length;
  }
}
