import type { FileKind } from '@eduvault/api-contract';
import type { CampusScope } from '../campus-scope';

export interface FileRecord {
  id: string;
  organizationId: string;
  kind: FileKind;
  storageKey: string;
  contentType: string;
  byteSize: number;
  originalName: string;
}

export interface StoredFile extends FileRecord {
  sha256: string;
}

export interface NewFile extends StoredFile {
  uploadedBy: string | null;
}

export abstract class FilesRepository {
  abstract insert(input: NewFile): Promise<void>;

  abstract findById(
    organizationId: string,
    id: string
  ): Promise<FileRecord | undefined>;

  abstract isAttached(file: FileRecord): Promise<boolean>;

  abstract isVisible(file: FileRecord, scope: CampusScope): Promise<boolean>;

  abstract delete(organizationId: string, id: string): Promise<void>;

  abstract findOrphansUploadedBefore(cutoff: Date): Promise<FileRecord[]>;

  /** Files in id order, for a job that walks every school's files. */
  abstract listAfter(
    afterId: string | undefined,
    limit: number
  ): Promise<StoredFile[]>;
}
