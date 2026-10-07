import { ApiClient } from './api';
import { runId } from './env';
import type { Ledger, PersonaKey } from './ledger';

const PASSWORD = 'e2e-password-123';

const VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED';
const BLOCKED_MEMBERSHIP =
  'accepting an invitation needs a verified email (auth uses generateId:false) and no HTTP endpoint adds a member, so admin, teacher and student cannot be created through the API';

interface Created {
  id: string;
}

export interface PersonaRecord {
  key: PersonaKey;
  email: string;
  password: string;
  userId: string;
  schoolId: string;
  campusId: string | null;
  /** Why this persona could not be created; its tests report BLOCKED instead of passing. */
  blocked: string | null;
}

export interface Fixture {
  runId: string;
  personas: Record<PersonaKey, PersonaRecord>;
  ownerStudentId: string;
  foreignStudentId: string;
  annexCampusId: string;
}

const emailFor = (key: PersonaKey) => `e2e-${runId}-${key}@eduvault.test`;

async function signUp(client: ApiClient, key: PersonaKey): Promise<string> {
  const body = await client.expectJson<{ user: Created }>(
    await client.post('/api/auth/sign-up/email', {
      name: `E2E ${key}`,
      email: emailFor(key),
      password: PASSWORD,
    }),
    200,
    `sign-up ${key}`
  );
  return body.user.id;
}

async function createSchool(client: ApiClient, name: string): Promise<string> {
  const school = await client.expectJson<Created>(
    await client.post('/api/auth/organization/create', {
      name: `${name} ${runId}`,
      slug: `${name.toLowerCase()}-${runId}`,
    }),
    200,
    `create school ${name}`
  );
  return school.id;
}

async function createCampus(client: ApiClient, name: string): Promise<string> {
  const campus = await client.expectJson<Created>(
    await client.post('/campuses', { name }),
    201,
    `create campus ${name}`
  );
  return campus.id;
}

async function createStudent(
  client: ApiClient,
  campusId: string,
  label: string
): Promise<string> {
  const student = await client.expectJson<Created>(
    await client.post('/students', {
      campusId,
      fullName: `E2E ${label} ${runId}`,
      admissionNumber: `E2E-${label}-${runId}`,
    }),
    201,
    `create student ${label}`
  );
  return student.id;
}

async function join(
  owner: ApiClient,
  key: PersonaKey,
  role: string,
  schoolId: string,
  campusId: string
): Promise<PersonaRecord> {
  const invitee = await ApiClient.create();
  try {
    const userId = await signUp(invitee, key);
    const invitation = await owner.expectJson<Created>(
      await owner.post('/api/auth/organization/invite-member', {
        email: emailFor(key),
        role,
        organizationId: schoolId,
        teamId: campusId,
      }),
      200,
      `invite ${key}`
    );
    await invitee.expectJson(
      await invitee.post('/api/auth/organization/accept-invitation', {
        invitationId: invitation.id,
      }),
      200,
      `accept invitation ${key}`
    );
    return {
      key,
      email: emailFor(key),
      password: PASSWORD,
      userId,
      schoolId,
      campusId,
      blocked: null,
    };
  } finally {
    await invitee.dispose();
  }
}

/**
 * Builds the five personas through the real API: owner, admin, teacher and student in one
 * school (Main and Annex campuses; teacher and student at Main), and a foreign-school owner.
 */
export async function provision(ledger: Ledger): Promise<Fixture> {
  const actorOf = (key: PersonaKey) => ({
    email: emailFor(key),
    password: PASSWORD,
  });
  const owner = await ApiClient.create();
  const foreign = await ApiClient.create();
  try {
    const ownerId = await signUp(owner, 'owner');
    const schoolId = await createSchool(owner, 'Greenfield');
    ledger.add({
      kind: 'school',
      id: schoolId,
      schoolId,
      actor: actorOf('owner'),
    });
    const mainId = await createCampus(owner, 'Main Campus');
    ledger.add({
      kind: 'campus',
      id: mainId,
      schoolId,
      actor: actorOf('owner'),
    });
    const annexId = await createCampus(owner, 'Annex');
    ledger.add({
      kind: 'campus',
      id: annexId,
      schoolId,
      actor: actorOf('owner'),
    });
    const ownerStudentId = await createStudent(owner, mainId, 'owner-student');
    ledger.add({
      kind: 'student',
      id: ownerStudentId,
      schoolId,
      actor: actorOf('owner'),
    });

    const members = {} as Record<
      'admin' | 'teacher' | 'student',
      PersonaRecord
    >;
    let blocked: string | null = null;
    for (const key of ['admin', 'teacher', 'student'] as const) {
      if (!blocked) {
        try {
          members[key] = await join(owner, key, key, schoolId, mainId);
          continue;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.includes(VERIFICATION_REQUIRED)
          ) {
            throw error;
          }
          blocked = BLOCKED_MEMBERSHIP;
        }
      }
      members[key] = {
        key,
        email: emailFor(key),
        password: PASSWORD,
        userId: '',
        schoolId,
        campusId: mainId,
        blocked,
      };
    }

    const foreignUserId = await signUp(foreign, 'foreign');
    const foreignSchoolId = await createSchool(foreign, 'Riverside');
    ledger.add({
      kind: 'school',
      id: foreignSchoolId,
      schoolId: foreignSchoolId,
      actor: actorOf('foreign'),
    });
    const foreignCampusId = await createCampus(foreign, 'Riverside Campus');
    ledger.add({
      kind: 'campus',
      id: foreignCampusId,
      schoolId: foreignSchoolId,
      actor: actorOf('foreign'),
    });
    const foreignStudentId = await createStudent(
      foreign,
      foreignCampusId,
      'foreign-student'
    );
    ledger.add({
      kind: 'student',
      id: foreignStudentId,
      schoolId: foreignSchoolId,
      actor: actorOf('foreign'),
    });

    return {
      runId,
      personas: {
        owner: {
          key: 'owner',
          email: emailFor('owner'),
          password: PASSWORD,
          userId: ownerId,
          schoolId,
          campusId: mainId,
          blocked: null,
        },
        ...members,
        foreign: {
          key: 'foreign',
          email: emailFor('foreign'),
          password: PASSWORD,
          userId: foreignUserId,
          schoolId: foreignSchoolId,
          campusId: foreignCampusId,
          blocked: null,
        },
      },
      ownerStudentId,
      foreignStudentId,
      annexCampusId: annexId,
    };
  } finally {
    await owner.dispose();
    await foreign.dispose();
  }
}

export async function signedInAs(persona: PersonaRecord): Promise<ApiClient> {
  const client = await ApiClient.create();
  await client.expectJson(
    await client.post('/api/auth/sign-in/email', {
      email: persona.email,
      password: persona.password,
    }),
    200,
    `sign-in ${persona.key}`
  );
  return client;
}
