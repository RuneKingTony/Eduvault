import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AuditList, RouteQuery, contract } from '@eduvault/api-contract';
import { AuditRepository } from '../../common/audit';
import { decodeCursor, encodeCursor } from '../../common/http/cursor';
import { PlatformRepository } from './platform.repository';
import { schoolNotFound } from './school-not-found';

const auditKeySchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

@Injectable()
export class PlatformAuditService {
  constructor(
    private readonly platform: PlatformRepository,
    private readonly audit: AuditRepository
  ) {}

  async list(
    query: RouteQuery<typeof contract.platform.audit.list>
  ): Promise<AuditList> {
    if (
      query.schoolId !== undefined &&
      !(await this.platform.findSchool(query.schoolId))
    ) {
      throw schoolNotFound();
    }
    const page = await this.audit.list({
      schoolId: query.schoolId,
      writesOnly: query.writesOnly === true,
      kind: query.kind,
      after:
        query.cursor === undefined
          ? undefined
          : decodeCursor(query.cursor, auditKeySchema),
      limit: query.limit,
    });
    return {
      items: page.items,
      nextCursor: page.next === undefined ? null : encodeCursor(page.next),
    };
  }
}
