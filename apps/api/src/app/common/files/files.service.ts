import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FileKind, FileRef } from '@eduvault/api-contract';
import { holds } from '@eduvault/policy';
import type { OrgContext } from '../auth';
import { FILE_STORE_TOKEN, type FileStore } from './file-store';
import { FILE_KIND_RULES, type FileKindRule } from './file-kinds';
import { FilesRepository, type FileRecord } from './files.repository';
import { sniffImageType, type ImageType } from './sniff-image';

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

interface FileDownload {
  bytes: Buffer;
  contentType: string;
}

const NAME_MAX = 200;

const notFound = () => new NotFoundException('File not found');

function checkContent(rule: FileKindRule, bytes: Buffer): ImageType {
  if (bytes.byteLength > rule.maxBytes) {
    throw new BadRequestException(rule.tooLarge);
  }
  const type = sniffImageType(bytes);
  if (type === undefined || !rule.types.includes(type)) {
    throw new BadRequestException(rule.wrongType);
  }
  return type;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly files: FilesRepository,
    @Inject(FILE_STORE_TOKEN) private readonly store: FileStore
  ) {}

  async upload(
    ctx: OrgContext,
    input: { kind: FileKind; file: UploadedFile }
  ): Promise<FileRef> {
    const rule = FILE_KIND_RULES[input.kind];
    if (!holds(ctx.permissions, rule.write)) {
      throw new ForbiddenException(rule.denied);
    }
    const { buffer } = input.file;
    const contentType = checkContent(rule, buffer);
    const id = randomUUID();
    const originalName = basename(input.file.originalname).slice(0, NAME_MAX);
    await this.files.insert({
      id,
      organizationId: ctx.organizationId,
      kind: input.kind,
      storageKey: id,
      contentType,
      byteSize: buffer.byteLength,
      originalName,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      uploadedBy: ctx.user.id,
    });
    try {
      await this.store.put({
        organizationId: ctx.organizationId,
        key: id,
        bytes: buffer,
      });
    } catch (error) {
      await this.files.delete(ctx.organizationId, id);
      throw error;
    }
    return { id, contentType, byteSize: buffer.byteLength, originalName };
  }

  async read(ctx: OrgContext, id: string): Promise<FileDownload> {
    const file = await this.readable(ctx, id);
    const bytes = await this.store.get({
      organizationId: file.organizationId,
      key: file.storageKey,
    });
    if (bytes === undefined) {
      throw notFound();
    }
    return { bytes, contentType: file.contentType };
  }

  async remove(ctx: OrgContext, id: string): Promise<void> {
    const file = await this.files.findById(ctx.organizationId, id);
    if (file === undefined) {
      throw notFound();
    }
    const rule = FILE_KIND_RULES[file.kind];
    if (!holds(ctx.permissions, rule.write)) {
      throw (await this.canRead(ctx, file))
        ? new ForbiddenException(rule.denied)
        : notFound();
    }
    await this.discard(file);
  }

  async discardById(organizationId: string, id: string): Promise<void> {
    const file = await this.files.findById(organizationId, id);
    if (file !== undefined) {
      await this.discard(file);
    }
  }

  private async discard(file: FileRecord): Promise<void> {
    await this.store.delete({
      organizationId: file.organizationId,
      key: file.storageKey,
    });
    await this.files.delete(file.organizationId, file.id);
  }

  private async readable(ctx: OrgContext, id: string): Promise<FileRecord> {
    const file = await this.files.findById(ctx.organizationId, id);
    if (file === undefined || !(await this.canRead(ctx, file))) {
      throw notFound();
    }
    return file;
  }

  private async canRead(ctx: OrgContext, file: FileRecord): Promise<boolean> {
    const { read } = FILE_KIND_RULES[file.kind];
    return (
      (read === undefined || holds(ctx.permissions, read)) &&
      (await this.files.isAttached(file))
    );
  }
}
