import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { OrgContext } from '../auth';
import type { FileStore, StoredFileKey } from './file-store';
import {
  FilesRepository,
  type FileRecord,
  type NewFile,
} from './files.repository';
import { FilesService } from './files.service';

const ORG = 'school-a';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

class FakeFiles extends FilesRepository {
  rows = new Map<string, NewFile>();
  attached = new Set<string>();

  insert(input: NewFile) {
    this.rows.set(input.id, input);
    return Promise.resolve();
  }

  findById(organizationId: string, id: string) {
    const row = this.rows.get(id);
    return Promise.resolve(
      row?.organizationId === organizationId ? row : undefined
    );
  }

  isAttached(file: FileRecord) {
    return Promise.resolve(this.attached.has(file.id));
  }

  delete(_organizationId: string, id: string) {
    this.rows.delete(id);
    return Promise.resolve();
  }

  deleteOrphansUploadedBefore() {
    return Promise.resolve(0);
  }
}

class FakeStore implements FileStore {
  blobs = new Map<string, Buffer>();
  failPut = false;

  put({ key, bytes }: StoredFileKey & { bytes: Buffer }) {
    if (this.failPut) {
      return Promise.reject(new Error('disk full'));
    }
    this.blobs.set(key, bytes);
    return Promise.resolve();
  }

  get({ key }: StoredFileKey) {
    return Promise.resolve(this.blobs.get(key));
  }

  delete({ key }: StoredFileKey) {
    this.blobs.delete(key);
    return Promise.resolve();
  }
}

const context = (...permissions: Permission[]): OrgContext => ({
  user: { id: 'user-1', email: 'a@example.com', name: 'Ada' },
  organizationId: ORG,
  roles: ['member'],
  permissions: toPermissionMap(permissions),
  isOwner: false,
  activeCampusId: null,
  campusScope: 'all',
  classScope: 'all',
  acting: null,
  headers: new Headers(),
});

const editor = context('schoolAccount:update');
const reader = context();

const setup = () => {
  const files = new FakeFiles();
  const store = new FakeStore();
  return { files, store, service: new FilesService(files, store) };
};

const upload = (
  service: FilesService,
  buffer: Buffer,
  ctx: OrgContext = editor
) =>
  service.upload(ctx, {
    kind: 'school_logo',
    file: { originalname: '../../logo.png', buffer },
  });

describe('FilesService.upload', () => {
  it('stores the bytes, sniffs the type and keeps only the base name', async () => {
    const { files, store, service } = setup();

    const ref = await upload(service, PNG);

    expect(ref).toMatchObject({
      contentType: 'image/png',
      byteSize: PNG.byteLength,
      originalName: 'logo.png',
    });
    expect(store.blobs.get(ref.id)).toEqual(PNG);
    const row = files.rows.get(ref.id);
    expect(row?.sha256).toHaveLength(64);
    expect(row?.uploadedBy).toBe('user-1');
  });

  it('answers 403 without schoolAccount:update', async () => {
    const { service } = setup();

    await expect(upload(service, PNG, reader)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('refuses a file over 1 MB with the PRD copy', async () => {
    const { service } = setup();
    const big = Buffer.concat([PNG, Buffer.alloc(1_048_576)]);

    await expect(upload(service, big)).rejects.toMatchObject({
      message: 'That logo is over 1 MB. Please choose a smaller one.',
    });
    await expect(upload(service, big)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('accepts a file of exactly 1,048,576 bytes', async () => {
    const { service } = setup();
    const exact = Buffer.concat([PNG, Buffer.alloc(1_048_576 - PNG.length)]);

    await expect(upload(service, exact)).resolves.toMatchObject({
      byteSize: 1_048_576,
    });
  });

  it('refuses a GIF and an executable named .png', async () => {
    const { service } = setup();

    for (const bytes of [
      Buffer.from('GIF89a....'),
      Buffer.from('MZ\u0090\u0000'),
    ]) {
      await expect(upload(service, bytes)).rejects.toMatchObject({
        message: 'Choose a PNG, JPG or WebP logo.',
      });
    }
  });

  it('removes the row again when the store fails', async () => {
    const { files, store, service } = setup();
    store.failPut = true;

    await expect(upload(service, PNG)).rejects.toThrow('disk full');
    expect(files.rows.size).toBe(0);
  });
});

describe('FilesService.read', () => {
  it('serves an attached logo to any member', async () => {
    const { files, service } = setup();
    const { id } = await upload(service, PNG);
    files.attached.add(id);

    const download = await service.read(reader, id);

    expect(download.contentType).toBe('image/png');
    expect(download.bytes).toEqual(PNG);
  });

  it('answers 404 for an unattached, another school’s and an unknown file', async () => {
    const { files, service } = setup();
    const { id } = await upload(service, PNG);

    await expect(service.read(reader, id)).rejects.toBeInstanceOf(
      NotFoundException
    );
    files.attached.add(id);
    await expect(
      service.read({ ...reader, organizationId: 'school-b' }, id)
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.read(reader, crypto.randomUUID())
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FilesService.remove', () => {
  it('deletes the row and the bytes for a writer', async () => {
    const { files, store, service } = setup();
    const { id } = await upload(service, PNG);

    await service.remove(editor, id);

    expect(files.rows.size).toBe(0);
    expect(store.blobs.size).toBe(0);
  });

  it('answers 403 for a reader of an attached logo and 404 when it is unattached', async () => {
    const { files, service } = setup();
    const { id } = await upload(service, PNG);

    await expect(service.remove(reader, id)).rejects.toBeInstanceOf(
      NotFoundException
    );
    files.attached.add(id);
    await expect(service.remove(reader, id)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('answers 404 for another school’s file', async () => {
    const { service } = setup();
    const { id } = await upload(service, PNG);

    await expect(
      service.remove({ ...editor, organizationId: 'school-b' }, id)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
