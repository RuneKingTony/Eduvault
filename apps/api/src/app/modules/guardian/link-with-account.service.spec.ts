import type { GuardianLink, LinkGuardianResult } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { ReservedAccountService } from '../gateway/reserved-account.service';
import type { GuardianService } from './guardian.service';
import { LinkWithAccountService } from './link-with-account.service';

const ctx = { organizationId: 'school-a' } as OrgContext;
const key = { studentId: 'ada', guardianId: 'father' };

function setup() {
  const events: string[] = [];
  const guardians = {
    link: () => {
      events.push('linked');
      return Promise.resolve({
        link: { guardianId: 'mother' },
      } as LinkGuardianResult);
    },
    updateLink: () => {
      events.push('updated');
      return Promise.resolve({ guardianId: 'father' } as GuardianLink);
    },
  } as unknown as GuardianService;
  const reservedAccounts = {
    tryEnsureForGuardian: (_organizationId: string, guardianId: string) => {
      events.push(`account:${guardianId}`);
      return Promise.resolve();
    },
  } as unknown as ReservedAccountService;
  return {
    events,
    service: new LinkWithAccountService(guardians, reservedAccounts),
  };
}

describe('LinkWithAccountService.link', () => {
  it('asks for the linked guardian’s account after the link', async () => {
    const { events, service } = setup();

    const result = await service.link(
      ctx,
      'ada',
      {} as Parameters<typeof service.link>[2]
    );

    expect(result.link.guardianId).toBe('mother');
    expect(events).toEqual(['linked', 'account:mother']);
  });
});

describe('LinkWithAccountService.updateLink', () => {
  it('asks for an account only when the guardian is made a payer', async () => {
    const { events, service } = setup();

    await service.updateLink(ctx, key, { relationship: 'guardian' });
    await service.updateLink(ctx, key, { paysFees: false });
    expect(events).toEqual(['updated', 'updated']);

    await service.updateLink(ctx, key, { paysFees: true });
    expect(events.slice(2)).toEqual(['updated', 'account:father']);
  });
});
