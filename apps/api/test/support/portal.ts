import type { INestApplication } from '@nestjs/common';
import type { LoginCredential } from '@eduvault/api-contract';
import type { Fixtures, TestUser } from './base-test';
import { createClass } from './factories/classes';
import { createStudent } from './factories/students';
import type { TwoSchoolsWithoutStudents } from './two-schools';

type Api = Fixtures['api'];
export type Signed = Pick<TestUser, 'cookie'>;

export const NEW_PASSWORD = 'a-brand-new-password-1';

let attempts = 0;
const nextAddress = () => {
  attempts += 1;
  return `198.51.100.${(attempts % 250) + 1}`;
};

const cookieOf = (setCookie: unknown): string =>
  (setCookie as string[]).map((cookie) => cookie.split(';')[0]).join('; ');

interface Credentials {
  username?: string;
  email?: string;
  password: string;
}

export async function signInPortal(
  api: Api,
  credentials: Credentials,
  settle = true
): Promise<Signed> {
  const { username, email, password } = credentials;
  const attempt =
    username === undefined
      ? api().post('/api/auth/sign-in/email').send({ email, password })
      : api().post('/api/auth/sign-in/username').send({ username, password });
  const res = await attempt.set('x-forwarded-for', nextAddress()).expect(200);
  const user = { cookie: cookieOf(res.headers['set-cookie']) };
  if (settle) {
    await api(user)
      .post('/me/password')
      .send({ newPassword: NEW_PASSWORD })
      .expect(204);
  }
  return user;
}

export const signInAs = (api: Api, login: LoginCredential | undefined) =>
  signInPortal(api, {
    ...(login?.username === undefined ? {} : { username: login.username }),
    ...(login?.email === undefined ? {} : { email: login.email }),
    password: login?.temporaryPassword ?? '',
  });

export const guardianOf = (logins: readonly LoginCredential[]) =>
  logins.find((login) => login.who === 'guardian');

export const studentOf = (logins: readonly LoginCredential[]) =>
  logins.find((login) => login.who === 'student');

interface Family {
  ada: Awaited<ReturnType<typeof createStudent>>;
  tobi: Awaited<ReturnType<typeof createStudent>>;
  guardianLogin: LoginCredential | undefined;
}

export async function family(
  app: INestApplication,
  schools: Pick<TwoSchoolsWithoutStudents, 'owner' | 'lekki' | 'ikeja'>
): Promise<Family> {
  const { owner, lekki, ikeja } = schools;
  const gold = await createClass(app, owner, {
    campusId: lekki.id,
    levelCode: 'JSS1',
    name: 'Gold',
  });
  const blue = await createClass(app, owner, {
    campusId: ikeja.id,
    levelCode: 'JSS1',
    name: 'Blue',
  });
  const ada = await createStudent(app, owner, {
    campusId: lekki.id,
    classArmId: gold.id,
    firstName: 'Ada',
    lastName: 'Okeke',
  });
  const guardianLogin = guardianOf(ada.logins);
  const tobi = await createStudent(app, owner, {
    campusId: ikeja.id,
    classArmId: blue.id,
    firstName: 'Tobi',
    lastName: 'Okeke',
    guardians: [
      {
        existingGuardianId: guardianLogin?.guardianId ?? '',
        relationship: 'mother',
        paysFees: false,
      },
    ],
  });
  return { ada, tobi, guardianLogin };
}
