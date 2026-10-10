import {
  BadRequestException,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { FILE_KINDS, fileKindSchema } from '@eduvault/api-contract';
import { FILE_KIND_RULES, UPLOAD_PARSER_LIMIT_BYTES } from './file-kinds';

const [WIDEST_RULE = FILE_KIND_RULES[FILE_KINDS[0]]] = Object.values(
  FILE_KIND_RULES
).toSorted((a, b) => b.maxBytes - a.maxBytes);

export class UploadInterceptor extends FileInterceptor('file', {
  limits: { fileSize: UPLOAD_PARSER_LIMIT_BYTES },
}) {
  override async intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Promise<ReturnType<CallHandler['handle']>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (!(error instanceof PayloadTooLargeException)) {
        throw error;
      }
      const request = context.switchToHttp().getRequest<Request>();
      const kind = fileKindSchema.safeParse(
        (request.body as { kind?: unknown } | undefined)?.kind
      );
      throw new BadRequestException(
        (kind.success ? FILE_KIND_RULES[kind.data] : WIDEST_RULE).tooLarge
      );
    }
  }
}
