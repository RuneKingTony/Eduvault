import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { z } from 'zod';
import type {
  CreateSchoolInput,
  CreateSchoolResult,
  PlatformSchool,
  PlatformSchoolList,
  PlatformSchoolMember,
  ReplaceOwnerInput,
  ReplaceOwnerResult,
  RouteQuery,
  contract,
} from '@eduvault/api-contract';
import { AuditRepository, type AuditAction } from '../../common/audit';
import { isSlugConflict, type AuthenticatedUser } from '../../common/auth';
import { decodeCursor, encodeCursor } from '../../common/http/cursor';
import { errorMessage } from '../../common/http/error-message';
import { PlatformRepository, type SchoolKey } from './platform.repository';
import { schoolNotFound } from './school-not-found';
import {
  SchoolProvisioningService,
  type SchoolOwner,
} from './school-provisioning.service';

const SCHOOL_PAGE_SIZE = 10;

const slugTaken = () => new ConflictException('That slug is taken.');

const schoolKeySchema = z.object({ name: z.string(), id: z.string() });

const SUSPENSION = {
  'school.suspend': {
    segment: 'suspend',
    conflict: 'This school is already suspended.',
  },
  'school.reactivate': {
    segment: 'reactivate',
    conflict: 'This school is not suspended.',
  },
} as const;

const encode = (key: SchoolKey | undefined): string | null =>
  key === undefined ? null : encodeCursor(key);

/**
 * Platform routes are not school-scoped, so no method here takes an OrgContext;
 * the controller's PlatformAuth guard is the only gate.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly provisioning: SchoolProvisioningService,
    private readonly platform: PlatformRepository,
    private readonly audit: AuditRepository
  ) {}

  async listSchools(
    query: RouteQuery<typeof contract.platform.schools.list>
  ): Promise<PlatformSchoolList> {
    const [page, totals, actingRequests] = await Promise.all([
      this.platform.listSchools({
        q: query.q,
        after:
          query.cursor === undefined
            ? undefined
            : decodeCursor(query.cursor, schoolKeySchema),
        limit: SCHOOL_PAGE_SIZE,
      }),
      this.platform.totals(),
      this.audit.countActing(),
    ]);
    return {
      items: page.items,
      totals: { ...totals, actingRequests },
      nextCursor: encode(page.next),
    };
  }

  async listSchoolOptions(): Promise<{
    items: { id: string; name: string }[];
  }> {
    return { items: await this.platform.listSchoolOptions() };
  }

  async getSchool(id: string): Promise<PlatformSchool> {
    const school = await this.platform.findSchool(id);
    if (!school) {
      throw schoolNotFound();
    }
    return school;
  }

  async listMembers(id: string): Promise<{ items: PlatformSchoolMember[] }> {
    await this.getSchool(id);
    return { items: await this.platform.listMembers(id) };
  }

  suspend(actor: AuthenticatedUser, id: string): Promise<PlatformSchool> {
    return this.changeSuspension(actor, id, 'school.suspend');
  }

  reactivate(actor: AuthenticatedUser, id: string): Promise<PlatformSchool> {
    return this.changeSuspension(actor, id, 'school.reactivate');
  }

  private async changeSuspension(
    actor: AuthenticatedUser,
    id: string,
    action: 'school.suspend' | 'school.reactivate'
  ): Promise<PlatformSchool> {
    await this.getSchool(id);
    const { segment, conflict } = SUSPENSION[action];
    const changed = await this.platform.setSuspended({
      organizationId: id,
      by: action === 'school.suspend' ? actor.id : null,
      audit: {
        actorUserId: actor.id,
        organizationId: id,
        action,
        path: `/platform/schools/${id}/${segment}`,
        status: 200,
      },
    });
    if (!changed) {
      throw new ConflictException(conflict);
    }
    return this.getSchool(id);
  }

  async replaceOwner(
    actor: AuthenticatedUser,
    id: string,
    input: ReplaceOwnerInput
  ): Promise<ReplaceOwnerResult> {
    const school = await this.getSchool(id);
    const owner = await this.resolveNewOwner(school, input.newOwner);
    try {
      await this.platform.replaceOwner({
        organizationId: id,
        newOwnerUserId: owner.id,
        previousOwner: input.previousOwner,
        audit: {
          actorUserId: actor.id,
          organizationId: id,
          action: 'school.replaceOwner',
          path: `/platform/schools/${id}/owner`,
          status: 200,
        },
      });
    } catch (error) {
      await this.provisioning.discard(owner);
      throw error;
    }
    await this.provisioning.welcome(owner, id);
    return {
      school: await this.getSchool(id),
      temporaryPassword: owner.temporaryPassword,
    };
  }

  private async resolveNewOwner(
    school: PlatformSchool,
    newOwner: ReplaceOwnerInput['newOwner']
  ): Promise<SchoolOwner> {
    const owner =
      'memberId' in newOwner
        ? await this.provisioning.ownerFromMember(school.id, newOwner.memberId)
        : await this.provisioning.resolveOwner({
            ownerName: newOwner.name,
            ownerEmail: newOwner.email,
          });
    const [only, ...rest] = school.owners;
    if (only?.id === owner.id && rest.length === 0) {
      throw new ConflictException('That person is already the only owner.');
    }
    return owner;
  }

  async createSchool(
    actor: AuthenticatedUser,
    input: CreateSchoolInput
  ): Promise<CreateSchoolResult> {
    if (await this.platform.slugTaken(input.slug)) {
      throw slugTaken();
    }
    const owner = await this.provisioning.resolveOwner(input);
    try {
      const school = await this.provisioning.createSchoolFor(owner.id, input);
      await this.provisioning.welcome(owner, school.id);
      await this.recordCreate(actor, school.id, 201);
      return {
        school,
        owner: { id: owner.id, email: owner.email },
        temporaryPassword: owner.temporaryPassword,
      };
    } catch (error) {
      const raced = isSlugConflict(error);
      await this.provisioning.compensateCreate(input.slug, owner, raced);
      if (raced) {
        throw slugTaken();
      }
      this.logger.error(`Create school failed: ${errorMessage(error)}`);
      await this.recordCreate(actor, null, 500).catch((auditError: unknown) => {
        this.logger.error(
          `Could not audit a failed create school: ${errorMessage(auditError)}`
        );
      });
      throw new InternalServerErrorException('Could not create the school');
    }
  }

  /** Written last, so a rolled-back school is never left behind a RESTRICT key. */
  private recordCreate(
    actor: AuthenticatedUser,
    organizationId: string | null,
    status: number
  ): Promise<void> {
    return this.audit.recordPlatform({
      actorUserId: actor.id,
      organizationId,
      action: 'school.create' satisfies AuditAction,
      path: '/platform/schools',
      status,
    });
  }
}
