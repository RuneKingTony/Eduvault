// Read when the app is built for this file, so the flag applies to its API only.
process.env['E2E_TRUST_INVITEES'] = 'true';

import { baseTest as test, expect } from './support/base-test';

test.describe('invitations with E2E_TRUST_INVITEES', () => {
  test('an invitee accepts without a verified email and holds the starter role on the campus', async ({
    api,
    signUp,
    createOrganization,
    createCampus,
  }) => {
    const owner = await signUp();
    const org = await createOrganization(owner);
    const campus = await createCampus(org, 'Lekki');
    const hire = await signUp();

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
