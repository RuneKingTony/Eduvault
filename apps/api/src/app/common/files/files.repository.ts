import type { FileKind } from '@eduvault/api-contract';

export interface FileRecord {
  id: string;
  organizationId: string;
  kind: FileKind;
  storageKey: string;
  contentType: string;
  byteSize: number;
  originalName: string;
}

export interface NewFile extends FileRecord {
  sha256: string;
  uploadedBy: string | null;
}

export abstract class FilesRepository {
  abstract insert(input: NewFile): Promise<void>;

  abstract findById(
    organizationId: string,
    id: string
  ): Promise<FileRecord | undefined>;

  abstract isAttached(file: FileRecord): Promise<boolean>;

  abstract delete(organizationId: string, id: string): Promise<void>;

  abstract deleteOrphansUploadedBefore(cutoff: Date): Promise<number>;
}
