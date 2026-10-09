import { afterAll, beforeAll, vi } from 'vitest';
import { baseTest as test, expect } from './support/base-test';

test.describe('invitations with E2E_TRUST_INVITEES', () => {
  beforeAll(() => {
    vi.stubEnv('E2E_TRUST_INVITEES', 'true');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  test('an invitee accepts without a verified email and holds the starter role on the campus', async ({
    api,
    createUser,
    createOrganization,
    createCampus,
  }) => {
    const owner = await createUser();
    const org = await createOrganization(owner);
    const campus = await createCampus(org, 'Lekki');
    const hire = await createUser();

    const invitation = await api(owner)
      .post('/api/auth/organization/invite-member')
      .send({
        email: hire.email,
        role: ['bursar'],
        organizationId: org.id,
        teamId: [campus.id],
      })
      .expect(200);
    await api(hire)
      .post('/api/auth/organization/accept-invitation')
      .send({ invitationId: (invitation.body as { id: string }).id })
      .expect(200);

    const access = await api(hire).get('/me/permissions').expect(200);
    expect(access.body).toMatchObject({
      roles: ['bursar'],
      permissions: { student: ['read'] },
      campusScope: [campus.id],
    });
  });
});
