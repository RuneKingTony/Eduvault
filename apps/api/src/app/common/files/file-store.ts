export interface StoredFileKey {
  organizationId: string;
  key: string;
}

export interface FileStore {
  put(input: StoredFileKey & { bytes: Buffer }): Promise<void>;
  get(input: StoredFileKey): Promise<Buffer | undefined>;
  delete(input: StoredFileKey): Promise<void>;
}

export const FILE_STORE_TOKEN = 'FILE_STORE_TOKEN';
