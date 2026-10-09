import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { CreateSchoolInput, PlatformSchool } from '@eduvault/api-contract';
import { AccountService, OrganizationAdminService } from '../../common/auth';
import { errorMessage } from '../../common/http/error-message';
import { PlatformRepository } from './platform.repository';

export interface SchoolOwner {
  id: string;
  email: string;
  temporaryPassword: string | null;
  createdHere: boolean;
}

const SCHOOL_CURRENCY = 'NGN';

const assertNotSuperAdmin = (account: { isSuperAdmin: boolean }): void => {
  if (account.isSuperAdmin) {
    throw new ConflictException(
      'A super admin cannot own a school. Use another email.'
    );
  }
};

/** Better Auth's calls run outside our transactions, so a failure is undone by hand. */
@Injectable()
export class SchoolProvisioningService {
  private readonly logger = new Logger(SchoolProvisioningService.name);

  constructor(
    private readonly accounts: AccountService,
    private readonly organizations: OrganizationAdminService,
    private readonly platform: PlatformRepository
  ) {}

  async resolveOwner(
    input: Pick<CreateSchoolInput, 'ownerName' | 'ownerEmail'>
  ): Promise<SchoolOwner> {
    const existing = await this.accounts.findByEmail(input.ownerEmail);
    if (existing) {
      assertNotSuperAdmin(existing);
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

  async ownerFromMember(
    organizationId: string,
    memberId: string
  ): Promise<SchoolOwner> {
    const member = await this.platform.findMember(organizationId, memberId);
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    const account = await this.accounts.findByEmail(member.email);
    if (account) {
      assertNotSuperAdmin(account);
    }
    return {
      id: member.userId,
      email: member.email,
      temporaryPassword: null,
      createdHere: false,
    };
  }

  async createSchoolFor(
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

  async welcome(owner: SchoolOwner, organizationId: string): Promise<void> {
    if (!owner.createdHere) {
      await this.organizations.startIdleSessionsIn(owner.id, organizationId);
    }
  }

  async compensateCreate(
    slug: string,
    owner: SchoolOwner,
    raced: boolean
  ): Promise<void> {
    try {
      if (!raced) {
        await this.organizations.deleteBySlug(slug);
      }
      await this.discard(owner);
    } catch (error) {
      this.logger.error(
        `Could not undo a failed create school: ${errorMessage(error)}`
      );
    }
  }

  async discard(owner: SchoolOwner): Promise<void> {
    if (owner.createdHere) {
      await this.accounts.deleteAccount(owner.id);
    }
  }
}
