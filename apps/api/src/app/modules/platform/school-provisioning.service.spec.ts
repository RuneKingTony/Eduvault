import { ConflictException, NotFoundException } from '@nestjs/common';
import type {
  AccountService,
  OrganizationAdminService,
} from '../../common/auth';
import type { PlatformRepository } from './platform.repository';
import { SchoolProvisioningService } from './school-provisioning.service';

const account = (isSuperAdmin: boolean) => ({
  id: 'user-1',
  email: 'pat@example.test',
  isSuperAdmin,
});

function setup(options: { member?: boolean; account?: boolean }) {
  const accounts = {
    findByEmail: vi
      .fn()
      .mockResolvedValue(
        options.account === undefined ? undefined : account(options.account)
      ),
  };
  const platform = {
    findMember: vi
      .fn()
      .mockResolvedValue(
        options.member === false
          ? undefined
          : { userId: 'user-1', email: 'pat@example.test' }
      ),
  };
  const service = new SchoolProvisioningService(
    accounts as unknown as AccountService,
    {} as OrganizationAdminService,
    platform as unknown as PlatformRepository
  );
  return { service };
}

describe('SchoolProvisioningService.ownerFromMember', () => {
  it('answers 404 for a member of another school', async () => {
    const { service } = setup({ member: false });
    await expect(
      service.ownerFromMember('school-a', 'm-1')
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a super admin, as a new owner by email is refused', async () => {
    const { service } = setup({ account: true });
    await expect(
      service.ownerFromMember('school-a', 'm-1')
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns the member as an owner who needs no new account', async () => {
    const { service } = setup({ account: false });
    expect(await service.ownerFromMember('school-a', 'm-1')).toEqual({
      id: 'user-1',
      email: 'pat@example.test',
      temporaryPassword: null,
      createdHere: false,
    });
  });
});
