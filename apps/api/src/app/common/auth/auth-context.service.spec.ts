import { NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  ACTING_ORG_HEADER,
  ACTING_REASON_HEADER,
} from '@eduvault/api-contract';
import { AuthContextService } from './auth-context.service';
import type { AuthedRequest, SessionContext } from './auth.types';

const session = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  user: { id: 'super-1', email: 'root@eduvault.test', name: 'Root' },
  mustChangePassword: false,
  platformRole: 'superadmin',
  activeOrganizationId: null,
  activeTeamId: null,
  headers: new Headers(),
  ...overrides,
});

const request = (headers: Record<string, string>) =>
  ({ headers }) as unknown as AuthedRequest;

function setup(schoolExists = true) {
  const query = vi.fn().mockResolvedValue({ rowCount: schoolExists ? 1 : 0 });
  const service = new AuthContextService(
    {} as never,
    { query } as unknown as Pool
  );
  return { service, query };
}

describe('AuthContextService.resolveActing', () => {
  it('returns no context for a user who is not a super admin, and never reads the headers', async () => {
    const { service, query } = setup();
    const acting = await service.resolveActing(
      session({ platformRole: null }),
      request({
        [ACTING_ORG_HEADER]: 'school-b',
        [ACTING_REASON_HEADER]: 'SUP-1',
      })
    );
    expect(acting).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it('returns no context without the school header', async () => {
    const { service } = setup();
    expect(await service.resolveActing(session(), request({}))).toBeUndefined();
    expect(
      await service.resolveActing(
        session(),
        request({ [ACTING_ORG_HEADER]: '  ' })
      )
    ).toBeUndefined();
  });

  it('answers 404 for an unknown school', async () => {
    const { service } = setup(false);
    await expect(
      service.resolveActing(
        session(),
        request({ [ACTING_ORG_HEADER]: 'nowhere' })
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is read-only without a reason, and keeps the super admin as the user', async () => {
    const { service } = setup();
    const ctx = await service.resolveActing(
      session(),
      request({ [ACTING_ORG_HEADER]: 'school-a' })
    );
    expect(ctx?.user.id).toBe('super-1');
    expect(ctx?.organizationId).toBe('school-a');
    expect(ctx?.roles).toEqual([]);
    expect(ctx?.isOwner).toBe(false);
    expect(ctx?.campusScope).toBe('all');
    expect(ctx?.activeCampusId).toBeNull();
    expect(ctx?.acting).toEqual({
      organizationId: 'school-a',
      writes: false,
      reason: null,
    });
  });

  it('allows writes with a reason and trims it', async () => {
    const { service } = setup();
    const ctx = await service.resolveActing(
      session(),
      request({
        [ACTING_ORG_HEADER]: 'school-a',
        [ACTING_REASON_HEADER]: '  SUP-2207 fix  ',
      })
    );
    expect(ctx?.isOwner).toBe(true);
    expect(ctx?.user.id).toBe('super-1');
    expect(ctx?.acting).toEqual({
      organizationId: 'school-a',
      writes: true,
      reason: 'SUP-2207 fix',
    });
  });

  it('treats a blank reason as none', async () => {
    const { service } = setup();
    const ctx = await service.resolveActing(
      session(),
      request({ [ACTING_ORG_HEADER]: 'school-a', [ACTING_REASON_HEADER]: ' ' })
    );
    expect(ctx?.acting?.writes).toBe(false);
  });

  it('stashes the audit entry before the reason is parsed, so a refused reason is recorded', async () => {
    const { service } = setup();
    const req = request({
      [ACTING_ORG_HEADER]: 'school-a',
      [ACTING_REASON_HEADER]: 'a'.repeat(201),
    });
    await expect(service.resolveActing(session(), req)).rejects.toMatchObject({
      status: 400,
    });
    expect(req.actingAudit).toEqual({
      actorUserId: 'super-1',
      organizationId: 'school-a',
      reason: null,
    });
  });

  it('refuses a reason over 200 characters', async () => {
    const { service } = setup();
    await expect(
      service.resolveActing(
        session(),
        request({
          [ACTING_ORG_HEADER]: 'school-a',
          [ACTING_REASON_HEADER]: 'a'.repeat(201),
        })
      )
    ).rejects.toMatchObject({ status: 400 });
  });
});
