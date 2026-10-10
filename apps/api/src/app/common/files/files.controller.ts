import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  contract,
  idParamsSchema,
  uploadFileFieldsSchema,
  type FileKind,
  type RouteOutput,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../auth';
import { zod } from '../http/zod.pipe';
import { FilesService, type UploadedFile as Upload } from './files.service';
import { UploadInterceptor } from './upload.interceptor';

const routes = contract.files;

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @OrganizationAuth()
  @UseInterceptors(UploadInterceptor)
  async upload(
    @Org() org: OrgContext,
    @UploadedFile() file: Upload | undefined,
    @Body(zod(uploadFileFieldsSchema)) body: { kind: FileKind }
  ): Promise<RouteOutput<typeof routes.upload>> {
    if (file === undefined) {
      throw new BadRequestException('Choose a file to upload.');
    }
    return this.files.upload(org, { kind: body.kind, file });
  }

  @Get(':id')
  @OrganizationAuth()
  async read(
    @Org() org: OrgContext,
    @Param(zod(idParamsSchema)) params: { id: string },
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    const { bytes, contentType } = await this.files.read(org, params.id);
    response.set({
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private',
    });
    return new StreamableFile(bytes);
  }

  @Delete(':id')
  @OrganizationAuth()
  @HttpCode(204)
  remove(
    @Org() org: OrgContext,
    @Param(zod(routes.remove.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.remove>> {
    return this.files.remove(org, params.id);
  }
}
