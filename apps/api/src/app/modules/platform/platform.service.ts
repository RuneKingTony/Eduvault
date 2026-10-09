import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type {
  CreateSchoolInput,
  CreateSchoolResult,
  PlatformSchool,
} from '@eduvault/api-contract';
import {
  AccountService,
  OrganizationAdminService,
  isSlugConflict,
} from '../../common/auth';
import { PlatformRepository } from './platform.repository';

interface SchoolOwner {
  id: string;
  email: string;
  temporaryPassword: string | null;
  createdHere: boolean;
}

const SCHOOL_CURRENCY = 'NGN';

const slugTaken = () => new ConflictException('That slug is taken.');

/**
 * Platform routes are not school-scoped, so no method here takes an OrgContext;
 * the controller's PlatformAuth guard is the only gate.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly accounts: AccountService,
    private readonly organizations: OrganizationAdminService,
    private readonly platform: PlatformRepository
  ) {}

  async listSchools(): Promise<{ items: PlatformSchool[] }> {
    return { items: await this.platform.listSchools() };
  }

  async createSchool(input: CreateSchoolInput): Promise<CreateSchoolResult> {
    if (await this.platform.slugTaken(input.slug)) {
      throw slugTaken();
    }
    const owner = await this.resolveOwner(input);
    try {
      const school = await this.createSchoolFor(owner.id, input);
      if (!owner.createdHere) {
        await this.organizations.startIdleSessionsIn(owner.id, school.id);
      }
      return {
        school,
        owner: { id: owner.id, email: owner.email },
        temporaryPassword: owner.temporaryPassword,
      };
    } catch (error) {
      const raced = isSlugConflict(error);
      await this.compensate(input.slug, owner, raced);
      if (raced) {
        throw slugTaken();
      }
      this.logger.error(
        `Create school failed: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      throw new InternalServerErrorException('Could not create the school');
    }
  }

  private async resolveOwner(input: CreateSchoolInput): Promise<SchoolOwner> {
    const existing = await this.accounts.findByEmail(input.ownerEmail);
    if (existing) {
      if (existing.isSuperAdmin) {
        throw new ConflictException(
          'A super admin cannot own a school. Use another email.'
        );
      }
      return {
        id: existing.id,
        email: existing.email,
        temporaryPassword: null,
        createdHere: false,
      };
    }
    const created = await this.accounts.createAccount({
      name: input.ownerName,
      email: input.ownerEmail,
      mustChangePassword: true,
    });
    return {
      id: created.user.id,
      email: created.user.email,
      temporaryPassword: created.temporaryPassword,
      createdHere: true,
    };
  }

  private async createSchoolFor(
    ownerId: string,
    input: CreateSchoolInput
  ): Promise<PlatformSchool> {
    const { id } = await this.organizations.create({
      name: input.name,
      slug: input.slug,
      userId: ownerId,
    });
    await this.platform.insertSchoolAccount({
      organizationId: id,
      name: input.name,
      city: input.city ?? null,
      admissionPrefix: input.admissionPrefix,
      currency: SCHOOL_CURRENCY,
    });
    const school = await this.platform.findSchool(id);
    if (!school) {
      throw new Error('School disappeared after it was created');
    }
    return school;
  }

  /**
   * Better Auth's calls run outside our transactions, so a failed create is
   * undone by hand; a raced slug is someone else's school and is left alone.
   */
  private async compensate(
    slug: string,
    owner: SchoolOwner,
    raced: boolean
  ): Promise<void> {
    try {
      if (!raced) {
        await this.organizations.deleteBySlug(slug);
      }
      if (owner.createdHere) {
        await this.accounts.deleteAccount(owner.id);
      }
    } catch (error) {
      this.logger.error(
        `Could not undo a failed create school: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
}
