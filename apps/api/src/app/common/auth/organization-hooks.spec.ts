import type { Pool } from 'pg';
import {
  LAST_OWNER_MESSAGE,
  assertCampusNameFree,
  ownerRule,
} from './organization-hooks';

const pool = (rows: Record<string, unknown>[], rowCount = rows.length) =>
  ({ query: vi.fn().mockResolvedValue({ rows, rowCount }) }) as unknown as Pool;

const member = (role: string) => ({
  id: 'member-1',
  organizationId: 'school-a',
  role,
});

describe('ownerRule', () => {
  it('strips administrator and principal when owner is added', async () => {
    const change = await ownerRule(pool([]), {
      member: member('member,administrator,teacher'),
      newRole: 'member,administrator,teacher,owner',
    });

    expect(change).toEqual({ data: { role: 'member,teacher,owner' } });
  });

  it('leaves a role change that is not about owner alone', async () => {
    await expect(
      ownerRule(pool([]), {
        member: member('member,owner'),
        newRole: 'member,owner,bursar',
      })
    ).resolves.toBeUndefined();
    await expect(
      ownerRule(pool([]), {
        member: member('member'),
        newRole: 'member,teacher',
      })
    ).resolves.toBeUndefined();
  });

  it('refuses removing owner from the last owner', async () => {
    await expect(
      ownerRule(pool([{ others: '0' }]), {
        member: member('member,owner'),
        newRole: 'member',
      })
    ).rejects.toMatchObject({ body: { message: LAST_OWNER_MESSAGE } });
  });

  it('allows removing owner while another owner remains', async () => {
    await expect(
      ownerRule(pool([{ others: '1' }]), {
        member: member('member,owner'),
        newRole: 'member',
      })
    ).resolves.toBeUndefined();
  });
});

describe('assertCampusNameFree', () => {
  it('answers 409 with the typed name when another team holds it', async () => {
    await expect(
      assertCampusNameFree(pool([{ '?column?': 1 }]), {
        organizationId: 'school-a',
        name: 'lekki',
      })
    ).rejects.toMatchObject({
      status: 'CONFLICT',
      body: { message: 'lekki already exists.' },
    });
  });

  it('passes when no other team has the name, skipping the team being edited', async () => {
    const free = pool([], 0);

    await expect(
      assertCampusNameFree(free, {
        organizationId: 'school-a',
        name: 'Lekki',
        exceptTeamId: 'team-1',
      })
    ).resolves.toBeUndefined();
    expect(free.query).toHaveBeenCalledWith(expect.any(String), [
      'school-a',
      'Lekki',
      'team-1',
    ]);
  });
});
