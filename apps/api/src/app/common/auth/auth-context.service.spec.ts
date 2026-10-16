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

const memberSession = () =>
  session({
    platformRole: null,
    activeOrganizationId: 'school-a',
    activeTeamId: null,
    user: { id: 'user-1', email: 'u@eduvault.test', name: 'Una' },
  });

function setupMember(
  role: string,
  customRoles: Record<string, Record<string, string[]>>,
  taught: string[] = []
) {
  const query = vi.fn((sql: string) => {
    if (sql.includes('"organizationRole"')) {
      return Promise.resolve({
        rows: Object.entries(customRoles).map(([slug, permission]) => ({
          role: slug,
          permission: JSON.stringify(permission),
        })),
      });
    }
    return Promise.resolve({
      rows: taught.map((id) => ({ class_arm_id: id })),
    });
  });
  const authService = {
    api: {
      getActiveMember: vi
        .fn()
        .mockResolvedValue({ organizationId: 'school-a', role }),
      listOrganizationTeams: vi.fn().mockResolvedValue([{ id: 'campus-1' }]),
      listUserTeams: vi
        .fn()
        .mockResolvedValue([{ id: 'campus-1', organizationId: 'school-a' }]),
    },
  };
  const service = new AuthContextService(
    authService as never,
    { query } as unknown as Pool
  );
  const taughtQueries = () =>
    query.mock.calls.filter(([sql]) => sql.includes('class_arm_teacher'));
  return { service, taughtQueries };
}

describe('AuthContextService.resolveOrganization', () => {
  it('binds class:read alone to the classes the member teaches this year', async () => {
    const { service, taughtQueries } = setupMember(
      'member,teacher',
      { teacher: { class: ['read'] } },
      ['arm-1']
    );
    const ctx = await service.resolveOrganization(memberSession());
    expect(ctx?.classScope).toEqual(['arm-1']);
    expect(taughtQueries()).toHaveLength(1);
  });

  it('unions this term’s subject-teacher rows with the class-teacher rows in one query', async () => {
    const { service, taughtQueries } = setupMember(
      'member,teacher',
      { teacher: { class: ['read'] } },
      ['arm-1', 'arm-2']
    );
    const ctx = await service.resolveOrganization(memberSession());
    expect(ctx?.classScope).toEqual(['arm-1', 'arm-2']);
    const [sql] = taughtQueries()[0] ?? [''];
    expect(sql).toContain('FROM subject_teacher');
    expect(sql).toContain('UNION');
    expect(sql).toContain('JOIN level_subject');
  });

  it('gives a class-scoped member who teaches nothing, such as with no current term, an empty scope', async () => {
    const { service } = setupMember('member,teacher', {
      teacher: { class: ['read'] },
    });
    const ctx = await service.resolveOrganization(memberSession());
    expect(ctx?.classScope).toEqual([]);
  });

  it('skips the lookup for class:readAll and for a member with no class permission', async () => {
    const principal = setupMember('member,principal', {
      principal: { class: ['read', 'readAll'] },
    });
    expect(
      (await principal.service.resolveOrganization(memberSession()))?.classScope
    ).toBe('all');
    expect(principal.taughtQueries()).toHaveLength(0);

    const bursar = setupMember('member,bursar', {
      bursar: { student: ['read'] },
    });
    expect(
      (await bursar.service.resolveOrganization(memberSession()))?.classScope
    ).toBe('all');
    expect(bursar.taughtQueries()).toHaveLength(0);
  });

  it('keeps the owner on every class', async () => {
    const { service } = setupMember('owner', {});
    const ctx = await service.resolveOrganization(memberSession());
    expect(ctx?.classScope).toBe('all');
  });
});
