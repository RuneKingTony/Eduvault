import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type {
  LoginCredential,
  PortalAnnouncements,
  PortalChild,
  PortalMe,
  PortalStudent,
} from '@eduvault/api-contract';
import { expect, type Fixtures, type TestUser } from './support/base-test';
import { YEAR_2027, createSchoolYear } from './support/factories/calendar';
import { createAnnouncement } from './support/factories/announcements';
import { assignClassTeacher, createClass } from './support/factories/classes';
import { createStudent } from './support/factories/students';
import { makeCurrent } from './support/factories/terms';
import {
  schoolsTest,
  type TwoSchoolsWithoutStudents,
} from './support/two-schools';

const test = schoolsTest;

type Api = Fixtures['api'];
type Signed = Pick<TestUser, 'cookie'>;

const NEW_PASSWORD = 'a-brand-new-password-1';
const YEAR = '2026/2027';
const TODAY = '2026-10-11';

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

async function signInPortal(
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

const signInAs = (api: Api, login: LoginCredential | undefined) =>
  signInPortal(api, {
    ...(login?.username === undefined ? {} : { username: login.username }),
    ...(login?.email === undefined ? {} : { email: login.email }),
    password: login?.temporaryPassword ?? '',
  });

const switchSchool = async (api: Api, user: Signed, organizationId: string) => {
  await api(user)
    .post('/api/auth/organization/set-active')
    .send({ organizationId })
    .expect(200);
};

const guardianOf = (logins: readonly LoginCredential[]) =>
  logins.find((login) => login.who === 'guardian');

const studentOf = (logins: readonly LoginCredential[]) =>
  logins.find((login) => login.who === 'student');

const meOf = async (api: Api, user: Signed): Promise<PortalMe> =>
  (await api(user).get('/portal/me').expect(200)).body as PortalMe;

const childrenOf = async (api: Api, user: Signed): Promise<PortalChild[]> =>
  (await api(user).get('/portal/children').expect(200)).body as PortalChild[];

const detailOf = async (
  api: Api,
  user: Signed,
  id: string
): Promise<PortalStudent> =>
  (await api(user).get(`/portal/students/${id}`).expect(200))
    .body as PortalStudent;

const newsOf = async (
  api: Api,
  user: Signed,
  path: string
): Promise<PortalAnnouncements> =>
  (await api(user).get(path).expect(200)).body as PortalAnnouncements;

const newsPath = (id: string, query = '') =>
  `/portal/students/${id}/announcements${query}`;

const byId = (a: string, b: string) => a.localeCompare(b);

const names = (children: readonly PortalChild[]) =>
  children.map((child) => child.firstName);

const studentRoutes = (id: string) => [
  `/portal/students/${id}`,
  `/portal/students/${id}/announcements`,
];

const allRoutes = (id: string) => [
  '/portal/me',
  '/portal/children',
  ...studentRoutes(id),
];

interface Family {
  ada: Awaited<ReturnType<typeof createStudent>>;
  tobi: Awaited<ReturnType<typeof createStudent>>;
  guardianLogin: LoginCredential | undefined;
}

async function family(
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

test.describe('GET /portal/me and /portal/children', () => {
  test('lists every child linked to a guardian with class and campus', async ({
    api,
    app,
    schools,
  }) => {
    const { guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);

    const me = await meOf(api, guardian);
    expect(me).toMatchObject({
      kind: 'guardian',
      login: { username: guardianLogin?.username, email: null },
      school: { name: 'School A', admissionPrefix: 'TST', logoUrl: null },
    });
    expect(me.name).toBe(guardianLogin?.name);
    expect(me.firstName).toBe(guardianLogin?.name.split(' ')[0]);
    expect(me.children).toEqual([
      expect.objectContaining({
        firstName: 'Ada',
        lastName: 'Okeke',
        className: 'JSS 1 Gold',
        campusName: 'Lekki',
        archived: false,
      }),
      expect.objectContaining({
        firstName: 'Tobi',
        className: 'JSS 1 Blue',
        campusName: 'Ikeja',
        archived: false,
      }),
    ]);
    expect(await childrenOf(api, guardian)).toEqual(me.children);
  });

  test('gives a student kind student and only themself', async ({
    api,
    app,
    schools,
  }) => {
    const { ada } = await family(app, schools);
    const student = await signInAs(api, studentOf(ada.logins));

    const me = await meOf(api, student);
    expect(me.kind).toBe('student');
    expect(me.firstName).toBe('Ada');
    expect(me.login.username).toBe(studentOf(ada.logins)?.username);
    expect(me.children.map((child) => child.id)).toEqual([ada.id]);
    expect(await childrenOf(api, student)).toEqual(me.children);
  });

  test('shows an email login its address and keeps a username login’s placeholder hidden', async ({
    api,
    app,
    schools: { owner, lekki },
  }) => {
    const parent = await createStudent(app, owner, {
      campusId: lekki.id,
      guardians: [
        {
          new: {
            fullName: 'Ngozi Okeke',
            phone: '08011112222',
            address: '1 Test Street',
            relationship: 'mother',
            paysFees: false,
            login: { kind: 'email', email: 'ngozi@example.test' },
          },
        },
      ],
    });
    const guardian = await signInAs(api, guardianOf(parent.logins));
    expect((await meOf(api, guardian)).login).toEqual({
      username: null,
      email: 'ngozi@example.test',
    });
    const student = await signInAs(api, studentOf(parent.logins));
    expect((await meOf(api, student)).login.email).toBeNull();
  });

  test('excludes other families and other schools', async ({
    api,
    app,
    schools,
  }) => {
    const { guardianLogin, ada, tobi } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);

    for (const list of [
      (await meOf(api, guardian)).children,
      await childrenOf(api, guardian),
    ]) {
      expect(list.map((child) => child.id).toSorted(byId)).toEqual(
        [ada.id, tobi.id].toSorted(byId)
      );
    }
    const { studentLekki, studentIkeja, studentB } = schools;
    const others = new Set([studentLekki.id, studentIkeja.id, studentB.id]);
    expect(
      (await childrenOf(api, guardian)).some((child) => others.has(child.id))
    ).toBe(false);
  });

  test('gives an owner who holds readOwn no children', async ({
    api,
    schools: { owner },
  }) => {
    expect((await meOf(api, owner)).children).toEqual([]);
    expect(await childrenOf(api, owner)).toEqual([]);
  });
});

test.describe('the school crest', () => {
  test('is a /files URL that a guardian can load', async ({
    api,
    app,
    schools,
  }) => {
    const { guardianLogin } = await family(app, schools);
    const crest = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 3),
    ]);
    const uploaded = await api(schools.owner)
      .post('/files')
      .field('kind', 'school_logo')
      .attach('file', crest, { filename: 'crest.png' })
      .expect(201);
    const fileId = uploaded.body.id as string;
    await api(schools.owner)
      .put('/school-account/logo')
      .send({ fileId })
      .expect(200);
    const guardian = await signInAs(api, guardianLogin);

    const { logoUrl } = (await meOf(api, guardian)).school;
    expect(logoUrl).toBe(`/files/${fileId}`);
    const file = await api(guardian)
      .get(logoUrl ?? '')
      .expect(200);
    expect(file.headers['content-type']).toContain('image/png');
  });
});

test.describe('GET /portal/students/:studentId', () => {
  test('shows class, campus and the lead class teacher from the current placement', async ({
    api,
    app,
    addMember,
    createUser,
    schools,
  }) => {
    const { ada, tobi, guardianLogin } = await family(app, schools);
    const { owner, lekki } = schools;
    const classes = (await api(owner).get('/classes').expect(200)).body as {
      id: string;
      displayName: string;
    }[];
    const gold = classes.find((item) => item.displayName === 'JSS 1 Gold');
    const assistant = await addMember(
      schools.orgA,
      await createUser({ name: 'Adaobi Assistant' }),
      { roles: ['teacher'], campuses: [lekki] }
    );
    const lead = await addMember(
      schools.orgA,
      await createUser({ name: 'Zainab Lead' }),
      { roles: ['teacher'], campuses: [lekki] }
    );
    await assignClassTeacher(app, owner, {
      classId: gold?.id ?? '',
      userId: assistant.id,
      role: 'assistant',
    });
    await assignClassTeacher(app, owner, {
      classId: gold?.id ?? '',
      userId: lead.id,
      role: 'lead',
    });
    const guardian = await signInAs(api, guardianLogin);

    const adaView = await detailOf(api, guardian, ada.id);
    expect(adaView).toMatchObject({
      id: ada.id,
      firstName: 'Ada',
      lastName: 'Okeke',
      dateOfBirth: '2014-03-03',
      className: 'JSS 1 Gold',
      campusName: 'Lekki',
      classTeacherName: 'Zainab Lead',
      username: studentOf(ada.logins)?.username,
      archived: false,
    });
    expect(adaView.admissionNumber).toMatch(/^TST-\d+$/);
    expect(adaView.admissionNumber).toBe(ada.admissionNumber);
    expect(await detailOf(api, guardian, tobi.id)).toMatchObject({
      className: 'JSS 1 Blue',
      campusName: 'Ikeja',
      classTeacherName: null,
    });
  });

  test('falls back to the home campus with no class when the current term has no placement', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, tobi, guardianLogin } = await family(app, schools);
    await createSchoolYear(app, schools.owner, YEAR_2027);
    await makeCurrent(api, schools.owner, { year: '2027/2028', sequence: 1 });
    const guardian = await signInAs(api, guardianLogin);

    expect(await detailOf(api, guardian, ada.id)).toMatchObject({
      className: null,
      campusName: 'Lekki',
      classTeacherName: null,
    });
    expect(await detailOf(api, guardian, tobi.id)).toMatchObject({
      className: null,
      campusName: 'Ikeja',
    });
    expect((await meOf(api, guardian)).children).toEqual([
      expect.objectContaining({ firstName: 'Ada', className: null }),
      expect.objectContaining({ firstName: 'Tobi', className: null }),
    ]);
  });
});

test.describe('GET /portal/students/:studentId/announcements', () => {
  test('shows everyone’s and the child’s campus, pinned first, the latest five, and counts the new ones', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const { owner, lekki, ikeja } = schools;
    const publish = async (
      title: string,
      on: string,
      extra: {
        campusId?: string | null;
        pinned?: boolean;
        status?: 'draft';
      } = {}
    ) => {
      clock.set(on);
      await createAnnouncement(app, owner, {
        campusId: extra.campusId ?? null,
        title,
        ...(extra.pinned === undefined ? {} : { pinned: extra.pinned }),
        ...(extra.status === undefined ? {} : { status: extra.status }),
      });
    };
    await publish('Pinned notice', '2026-10-08', { pinned: true });
    await publish('Fresh for everyone', '2026-10-10');
    await publish('Lekki trip', '2026-10-05', { campusId: lekki.id });
    await publish('Ikeja trip', '2026-10-06', { campusId: ikeja.id });
    await publish('Older one', '2026-09-25');
    await publish('Older two', '2026-09-24');
    await publish('Older three', '2026-09-23');
    await publish('Unpublished', '2026-10-09', { status: 'draft' });
    clock.set(TODAY);
    const guardian = await signInAs(api, guardianLogin);

    const news = await newsOf(api, guardian, newsPath(ada.id));
    expect(news.items.map((item) => item.title)).toEqual([
      'Pinned notice',
      'Fresh for everyone',
      'Lekki trip',
      'Older one',
      'Older two',
    ]);
    expect(news.items[0]).toMatchObject({ pinned: true });
    expect(news.newThisWeek).toBe(3);

    const two = await newsOf(api, guardian, newsPath(ada.id, '?limit=2'));
    expect(two.items.map((item) => item.title)).toEqual([
      'Pinned notice',
      'Fresh for everyone',
    ]);
    expect(two.newThisWeek).toBe(3);
    await api(guardian)
      .get(`/portal/students/${ada.id}/announcements?limit=6`)
      .expect(400);

    clock.set('2026-10-13');
    expect((await newsOf(api, guardian, newsPath(ada.id))).newThisWeek).toBe(2);
  });

  test('counts an item published seven days ago as new and one published eight days ago as not', async ({
    api,
    app,
    clock,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    for (const [title, on] of [
      ['Seven days old', '2026-10-04'],
      ['Eight days old', '2026-10-03'],
    ]) {
      clock.set(on ?? TODAY);
      await createAnnouncement(app, schools.owner, { campusId: null, title });
    }
    clock.set(TODAY);
    const guardian = await signInAs(api, guardianLogin);

    expect((await newsOf(api, guardian, newsPath(ada.id))).newThisWeek).toBe(1);
  });

  test('shows the other campus’s items only to that campus’s child', async ({
    api,
    app,
    schools,
  }) => {
    const { tobi, guardianLogin } = await family(app, schools);
    await createAnnouncement(app, schools.owner, {
      campusId: schools.lekki.id,
      title: 'Lekki only',
    });
    await createAnnouncement(app, schools.owner, {
      campusId: schools.ikeja.id,
      title: 'Ikeja only',
    });
    const guardian = await signInAs(api, guardianLogin);

    const news = await newsOf(api, guardian, newsPath(tobi.id));
    expect(news.items.map((item) => item.title)).toEqual(['Ikeja only']);
  });
});

test.describe('isolation', () => {
  test('a student asking for a sibling’s id gets 404 on both student routes', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, tobi } = await family(app, schools);
    const student = await signInAs(api, studentOf(ada.logins));

    for (const path of studentRoutes(tobi.id)) {
      await api(student).get(path).expect(404);
    }
    await detailOf(api, student, ada.id);
  });

  test('a guardian asking for another family’s child or another school’s child gets 404 on every student route', async ({
    api,
    app,
    schools,
  }) => {
    const { guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);
    const { studentLekki, studentIkeja, studentB } = schools;

    for (const stranger of [studentLekki, studentIkeja, studentB]) {
      for (const path of studentRoutes(stranger.id)) {
        await api(guardian).get(path).expect(404);
      }
    }
    for (const path of studentRoutes('0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11')) {
      await api(guardian).get(path).expect(404);
    }
  });

  test('an owner with no student links gets 404 for any child', async ({
    api,
    schools: { owner, studentLekki },
  }) => {
    for (const path of studentRoutes(studentLekki.id)) {
      await api(owner).get(path).expect(404);
    }
  });

  test('the other school’s owner gets 404 for this school’s child', async ({
    api,
    schools: { ownerB, studentLekki },
  }) => {
    for (const path of studentRoutes(studentLekki.id)) {
      await api(ownerB).get(path).expect(404);
    }
  });
});

test.describe('permissions', () => {
  test('refuse a visitor with no session with 401', async ({
    api,
    schools: { studentLekki },
  }) => {
    for (const path of allRoutes(studentLekki.id)) {
      await api().get(path).expect(401);
    }
  });

  test('answer 403 on every portal route to a staff member with student:read but not student:readOwn', async ({
    api,
    withPermissions,
    schools,
  }) => {
    const staff = await withPermissions(schools.orgA, ['student:read']);
    for (const path of allRoutes(schools.studentLekki.id)) {
      await api(staff).get(path).expect(403);
    }
  });

  test('answer 403 to an in-scope student whose role lost student:readOwn, before checking scope', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { ada } = await family(app, schools);
    const student = await signInAs(api, studentOf(ada.logins));
    await detailOf(api, student, ada.id);
    await pool.query(
      `UPDATE "organizationRole" SET permission = '{}'
       WHERE "organizationId" = $1 AND role = 'student'`,
      [schools.orgA.id]
    );

    for (const path of allRoutes(ada.id)) {
      await api(student).get(path).expect(403);
    }
  });
});

test.describe('left and graduated children', () => {
  test('stay listed for the guardian as archived, and the left and the graduated student’s own logins get 403 NoSchool', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const { owner, lekki } = schools;
    const final = await createClass(app, owner, {
      campusId: lekki.id,
      levelCode: 'SS3',
      name: 'Final',
    });
    const efe = await createStudent(app, owner, {
      campusId: lekki.id,
      classArmId: final.id,
      firstName: 'Efe',
      lastName: 'Okeke',
      guardians: [
        {
          existingGuardianId: guardianLogin?.guardianId ?? '',
          relationship: 'mother',
          paysFees: false,
        },
      ],
    });
    const guardian = await signInAs(api, guardianLogin);
    const adaLogin = await signInAs(api, studentOf(ada.logins));
    await meOf(api, adaLogin);
    const efeLogin = await signInAs(api, studentOf(efe.logins));
    await meOf(api, efeLogin);

    await api(owner)
      .post(`/students/${ada.id}/leave`)
      .send({ reason: 'relocated', lastDay: ada.admittedOn })
      .expect(201);
    await makeCurrent(api, owner, { year: YEAR, sequence: 3 });
    await api(owner)
      .post(`/classes/${final.id}/graduate`)
      .send({ studentIds: [efe.id] })
      .expect(201);

    const children = await childrenOf(api, guardian);
    expect(names(children)).toEqual(['Ada', 'Efe', 'Tobi']);
    expect(children.map((child) => child.archived)).toEqual([
      true,
      true,
      false,
    ]);
    expect((await detailOf(api, guardian, ada.id)).archived).toBe(true);
    expect((await meOf(api, guardian)).children).toEqual(children);

    for (const login of [adaLogin, efeLogin]) {
      const refused = await api(login).get('/portal/me').expect(403);
      expect(refused.body).toMatchObject({ code: 'NoSchool' });
    }
  });
});

test.describe('a guardian with children at two schools', () => {
  test('sees each school’s children only after switching the active school', async ({
    api,
    app,
    schools,
  }) => {
    const email = 'both-schools@example.test';
    const guardianDraft = (fullName: string) => ({
      new: {
        fullName,
        phone: '08099990000',
        address: '1 Test Street',
        relationship: 'mother' as const,
        paysFees: false,
        login: { kind: 'email' as const, email },
      },
    });
    const inA = await createStudent(app, schools.owner, {
      campusId: schools.lekki.id,
      firstName: 'Amaka',
      guardians: [guardianDraft('Mrs Both')],
    });
    await createStudent(app, schools.ownerB, {
      campusId: schools.campusB.id,
      firstName: 'Bayo',
      guardians: [guardianDraft('Mrs Both')],
    });
    const first = await signInAs(api, guardianOf(inA.logins));
    expect(first.cookie).not.toBe('');
    const guardian = await signInPortal(
      api,
      { email, password: NEW_PASSWORD },
      false
    );

    await switchSchool(api, guardian, schools.orgA.id);
    const inSchoolA = await meOf(api, guardian);
    expect(inSchoolA.school.name).toBe('School A');
    expect(names(inSchoolA.children)).toEqual(['Amaka']);

    await switchSchool(api, guardian, schools.orgB.id);
    const inSchoolB = await meOf(api, guardian);
    expect(inSchoolB.school.name).toBe('School B');
    expect(names(inSchoolB.children)).toEqual(['Bayo']);
    await api(guardian).get(`/portal/students/${inA.id}`).expect(404);
  });
});

const isPortalRoute = (route: string): boolean =>
  route.split('/').includes('portal');

const pathsOf = (target: object): string[] => {
  const declared = Reflect.getMetadata(PATH_METADATA, target) as
    string | string[] | undefined;
  return [declared ?? '']
    .flat()
    .map((path) => `/${path}`.replaceAll(/\/+/g, '/'));
};

function portalHandlers(app: INestApplication) {
  return [...app.get(ModulesContainer).values()]
    .flatMap((module) => [...module.controllers.values()])
    .flatMap(({ metatype }) =>
      metatype === null
        ? []
        : Object.getOwnPropertyNames(metatype.prototype).flatMap((name) => {
            const handler = metatype.prototype[name] as object;
            const method = Reflect.getMetadata(METHOD_METADATA, handler) as
              RequestMethod | undefined;
            const routes = pathsOf(metatype).flatMap((base) =>
              pathsOf(handler).map((path) => `${base}/${path}`)
            );
            return method === undefined ||
              !routes.some((route) => isPortalRoute(route))
              ? []
              : [{ name: `${metatype.name}.${name}`, method }];
          })
    );
}

test.describe('a read-only portal', () => {
  test('rejects every non-GET method on every portal route', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);
    const client = api(guardian);

    for (const path of allRoutes(ada.id)) {
      for (const send of [
        () => client.post(path),
        () => client.put(path),
        () => client.patch(path),
        () => client.delete(path),
      ]) {
        const res = await send();
        expect([404, 405]).toContain(res.status);
      }
    }
  });

  test('registers only GET handlers under the portal path', ({ app }) => {
    const handlers = portalHandlers(app);

    expect(handlers.length).toBeGreaterThan(0);
    expect(
      handlers.filter(({ method }) => method !== RequestMethod.GET)
    ).toEqual([]);
  });
});
