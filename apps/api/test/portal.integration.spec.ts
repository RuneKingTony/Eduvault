import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type {
  PortalAnnouncementList,
  PortalAnnouncements,
  PortalChild,
  PortalMe,
  PortalPriceList,
  PortalPurchases,
  PortalStudent,
} from '@eduvault/api-contract';
import { expect, type Fixtures } from './support/base-test';
import { YEAR_2027, createSchoolYear } from './support/factories/calendar';
import { createAnnouncement } from './support/factories/announcements';
import { assignClassTeacher, createClass } from './support/factories/classes';
import { createMoneyAccount } from './support/factories/finance';
import { createStudent } from './support/factories/students';
import {
  classLevelId,
  createItem,
  receive,
  sell,
} from './support/factories/store';
import { makeCurrent } from './support/factories/terms';
import {
  NEW_PASSWORD,
  family,
  guardianOf,
  signInAs,
  signInPortal,
  studentOf,
  type Signed,
} from './support/portal';
import { schoolsTest } from './support/two-schools';

const test = schoolsTest;

type Api = Fixtures['api'];

const YEAR = '2026/2027';
const TODAY = '2026-10-11';

const switchSchool = async (api: Api, user: Signed, organizationId: string) => {
  await api(user)
    .post('/api/auth/organization/set-active')
    .send({ organizationId })
    .expect(200);
};

const meOf = async (api: Api, user: Signed): Promise<PortalMe> =>
  (await api(user).get('/portal/me').expect(200)).body as PortalMe;

const childrenOf = async (api: Api, user: Signed): Promise<PortalChild[]> =>
  (
    (await api(user).get('/portal/children').expect(200)).body as PortalChild[]
  ).map(({ balanceMinor: _balance, ...child }) => child);

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

const listOf = async (
  api: Api,
  user: Signed,
  path: string
): Promise<PortalAnnouncementList> =>
  (await api(user).get(path).expect(200)).body as PortalAnnouncementList;

const listPath = (id: string, query = '') =>
  `/portal/students/${id}/announcements/all${query}`;

const newsPath = (id: string, query = '') =>
  `/portal/students/${id}/announcements${query}`;

const byId = (a: string, b: string) => a.localeCompare(b);

const names = (children: readonly PortalChild[]) =>
  children.map((child) => child.firstName);

const studentRoutes = (id: string) => [
  `/portal/students/${id}`,
  `/portal/students/${id}/announcements`,
  `/portal/students/${id}/announcements/all`,
  `/portal/students/${id}/statement`,
];

const purchaseRoutes = (id: string) => [
  `/portal/students/${id}/purchases`,
  `/portal/students/${id}/price-list`,
];

const allRoutes = (id: string) => [
  '/portal/me',
  '/portal/children',
  '/portal/family-statement',
  ...studentRoutes(id),
];

const everyRoute = (id: string) => [...allRoutes(id), ...purchaseRoutes(id)];

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
      school: {
        name: 'School A',
        admissionPrefix: 'TST',
        currency: 'NGN',
        logoUrl: null,
      },
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

test.describe('GET /portal/students/:studentId/announcements/all', () => {
  test('pages every published item for the child, pinned first then newest, and never a draft, a withdrawn or another campus’s item', async ({
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
      extra: { campusId?: string | null; pinned?: boolean } = {}
    ) => {
      clock.set(on);
      return createAnnouncement(app, owner, {
        campusId: extra.campusId ?? null,
        title,
        ...(extra.pinned === undefined ? {} : { pinned: extra.pinned }),
      });
    };
    await publish('Pinned notice', '2026-09-01', { pinned: true });
    await publish('Day 3', '2026-10-03');
    await publish('Day 4 Lekki', '2026-10-04', { campusId: lekki.id });
    await publish('Day 5', '2026-10-05');
    await publish('Day 6 Ikeja', '2026-10-06', { campusId: ikeja.id });
    await publish('Day 7', '2026-10-07');
    await publish('Day 8', '2026-10-08');
    const gone = await publish('Withdrawn one', '2026-10-09');
    clock.set('2026-10-10');
    await api(owner).post(`/announcements/${gone.id}/withdraw`).expect(201);
    clock.set('2026-10-09');
    await createAnnouncement(app, owner, {
      campusId: null,
      title: 'Draft one',
      status: 'draft',
    });
    clock.set(TODAY);
    const guardian = await signInAs(api, guardianLogin);

    const first = await listOf(api, guardian, listPath(ada.id, '?pageSize=3'));
    expect(first.total).toBe(6);
    expect(first.items.map((item) => item.title)).toEqual([
      'Pinned notice',
      'Day 8',
      'Day 7',
    ]);
    const second = await listOf(
      api,
      guardian,
      listPath(ada.id, '?page=2&pageSize=3')
    );
    expect(second.items.map((item) => item.title)).toEqual([
      'Day 5',
      'Day 4 Lekki',
      'Day 3',
    ]);
    const beyond = await listOf(
      api,
      guardian,
      listPath(ada.id, '?page=3&pageSize=3')
    );
    expect(beyond).toEqual({ items: [], total: 6 });
    expect((await listOf(api, guardian, listPath(ada.id))).items).toHaveLength(
      6
    );
  });

  test('refuses a page size over fifty or a page below one', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);

    for (const query of ['?pageSize=51', '?pageSize=0', '?page=0']) {
      await api(guardian).get(listPath(ada.id, query)).expect(400);
    }
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
    for (const path of everyRoute(studentLekki.id)) {
      await api().get(path).expect(401);
    }
  });

  test('answer 403 on every portal route to a staff member with student:read but not student:readOwn', async ({
    api,
    withPermissions,
    schools,
  }) => {
    const staff = await withPermissions(schools.orgA, ['student:read']);
    for (const path of everyRoute(schools.studentLekki.id)) {
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

const guardianOnly = '{"student":["readOwn"]}';

const purchasesOf = async (
  api: Api,
  user: Signed,
  id: string
): Promise<PortalPurchases> =>
  (await api(user).get(`/portal/students/${id}/purchases`).expect(200))
    .body as PortalPurchases;

const priceListOf = async (
  api: Api,
  user: Signed,
  id: string
): Promise<PortalPriceList> =>
  (await api(user).get(`/portal/students/${id}/price-list`).expect(200))
    .body as PortalPriceList;

async function shopFor(
  app: INestApplication,
  api: Api,
  where: {
    schools: Parameters<typeof family>[1] & { orgA: { id: string } };
    pool: Parameters<typeof classLevelId>[0];
  }
) {
  const { schools, pool } = where;
  const { owner, lekki, ikeja, orgA } = schools;
  const level = await classLevelId(pool, orgA.id, 'JSS1');
  const cashLekki = await createMoneyAccount(app, owner, {
    name: 'Lekki cash box',
    kind: 'cash',
    campusId: lekki.id,
  });
  const cashIkeja = await createMoneyAccount(app, owner, {
    name: 'Ikeja cash box',
    kind: 'cash',
    campusId: ikeja.id,
  });
  const maths = await createItem(api, owner, {
    kind: 'book',
    name: 'Mathematics',
    variant: null,
    classLevelId: level,
    costPriceMinor: 250_000,
    sellPriceMinor: 320_000,
  });
  const small = await createItem(api, owner, {
    variant: 'Size 10',
    sellPriceMinor: 400_000,
  });
  const large = await createItem(api, owner, { variant: 'Size 12' });
  const retired = await createItem(api, owner, {
    name: 'Old badge',
    variant: null,
  });
  await api(owner)
    .patch(`/store/items/${retired.id}`)
    .send({ retired: true })
    .expect(200);
  await receive(api, owner, {
    campusId: lekki.id,
    accountId: cashLekki.id,
    lines: [
      { itemId: maths.id, quantity: 4, unitCostMinor: 250_000 },
      { itemId: small.id, quantity: 4, unitCostMinor: 350_000 },
      { itemId: large.id, quantity: 4, unitCostMinor: 350_000 },
    ],
  });
  await receive(api, owner, {
    campusId: ikeja.id,
    accountId: cashIkeja.id,
    lines: [{ itemId: large.id, quantity: 4, unitCostMinor: 350_000 }],
  });
  return { maths, small, large, retired };
}

test.describe('Purchases and the store price list', () => {
  test.beforeEach(({ clock }) => {
    clock.set(TODAY);
  });

  test('show a child’s sales at the sale prices, to the student, a paying and a non-paying guardian', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const { ada, tobi, guardianLogin } = await family(app, schools);
    const { maths, large } = await shopFor(app, api, { schools, pool });
    const adaSale = await sell(api, owner, {
      studentId: ada.id,
      lines: [
        { itemId: maths.id, quantity: 1 },
        { itemId: large.id, quantity: 2 },
      ],
    });
    const tobiSale = await sell(api, owner, {
      studentId: tobi.id,
      lines: [{ itemId: large.id, quantity: 1 }],
    });
    const student = await signInAs(api, studentOf(ada.logins));
    const guardian = await signInAs(api, guardianLogin);

    const own = await purchasesOf(api, student, ada.id);
    expect(own).toMatchObject({
      termName: 'First term',
      spentThisTermMinor: adaSale.totalMinor,
      termPurchaseCount: 1,
      itemsBought: 3,
    });
    expect(own.sales).toEqual([
      {
        id: adaSale.id,
        date: TODAY,
        campusName: 'Lekki',
        receiptNumber: adaSale.receiptNumber,
        method: 'cash',
        totalMinor: adaSale.totalMinor,
        lines: [
          {
            itemName: 'School shirt, Size 12',
            quantity: 2,
            unitPriceMinor: 450_000,
            amountMinor: 900_000,
          },
          {
            itemName: 'Mathematics',
            quantity: 1,
            unitPriceMinor: 320_000,
            amountMinor: 320_000,
          },
        ],
      },
    ]);
    expect(
      (await purchasesOf(api, guardian, ada.id)).sales.map((sale) => sale.id)
    ).toEqual([adaSale.id]);
    expect(
      (await purchasesOf(api, guardian, tobi.id)).sales.map((sale) => sale.id)
    ).toEqual([tobiSale.id]);
  });

  test('show an empty history for a child who bought nothing', async ({
    api,
    app,
    schools,
  }) => {
    const { ada } = await family(app, schools);
    const student = await signInAs(api, studentOf(ada.logins));

    expect(await purchasesOf(api, student, ada.id)).toEqual({
      termName: 'First term',
      spentThisTermMinor: 0,
      termPurchaseCount: 0,
      itemsBought: 0,
      sales: [],
    });
  });

  test('keep the frozen prices after the item’s price changes', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { owner } = schools;
    const { ada } = await family(app, schools);
    const { large } = await shopFor(app, api, { schools, pool });
    await sell(api, owner, {
      studentId: ada.id,
      lines: [{ itemId: large.id, quantity: 1 }],
    });
    await api(owner)
      .patch(`/store/items/${large.id}`)
      .send({ sellPriceMinor: 900_000 })
      .expect(200);
    const student = await signInAs(api, studentOf(ada.logins));

    const purchases = await purchasesOf(api, student, ada.id);
    expect(purchases.sales[0]?.lines[0]?.unitPriceMinor).toBe(450_000);
    const list = await priceListOf(api, student, ada.id);
    expect(list.uniforms[0]?.minPriceMinor).toBe(400_000);
    expect(list.uniforms[0]?.maxPriceMinor).toBe(900_000);
  });

  test('list the books for the child’s level and every uniform, out of stock from the child’s own campus store', async ({
    api,
    app,
    pool,
    schools,
  }) => {
    const { ada, tobi, guardianLogin } = await family(app, schools);
    await shopFor(app, api, { schools, pool });
    const student = await signInAs(api, studentOf(ada.logins));
    const guardian = await signInAs(api, guardianLogin);

    const atLekki = await priceListOf(api, student, ada.id);
    expect(atLekki).toEqual({
      levelName: 'JSS 1',
      books: [{ name: 'Mathematics', priceMinor: 320_000, inStock: true }],
      uniforms: [
        {
          name: 'School shirt',
          sizes: ['Size 10', 'Size 12'],
          minPriceMinor: 400_000,
          maxPriceMinor: 450_000,
          inStock: true,
        },
      ],
      paymentMethods: ['cash', 'pos', 'transfer'],
    });
    const atIkeja = await priceListOf(api, guardian, tobi.id);
    expect(atIkeja.books).toEqual([
      { name: 'Mathematics', priceMinor: 320_000, inStock: false },
    ]);
    expect(atIkeja.uniforms[0]?.inStock).toBe(true);
    const listed = [...atLekki.books, ...atLekki.uniforms].map(
      (row) => row.name
    );
    expect(listed).not.toContain('Old badge');
  });

  test('name only the ways to pay the school switched on', async ({
    api,
    app,
    schools,
  }) => {
    const { owner } = schools;
    const { ada } = await family(app, schools);
    await api(owner)
      .patch('/school-settings/payment-rules')
      .send({ pos: false })
      .expect(200);
    const student = await signInAs(api, studentOf(ada.logins));

    expect((await priceListOf(api, student, ada.id)).paymentMethods).toEqual([
      'cash',
      'transfer',
    ]);
  });

  test('answer 404 for another family’s child, an unlinked sibling and another school', async ({
    api,
    app,
    schools,
  }) => {
    const { owner, lekki, studentB } = schools;
    const { ada, guardianLogin } = await family(app, schools);
    const sibling = await createStudent(app, owner, {
      campusId: lekki.id,
      firstName: 'Kemi',
      lastName: 'Okeke',
    });
    const student = await signInAs(api, studentOf(ada.logins));
    const guardian = await signInAs(api, guardianLogin);

    for (const id of [schools.studentLekki.id, sibling.id, studentB.id]) {
      for (const path of purchaseRoutes(id)) {
        await api(guardian).get(path).expect(404);
        await api(student).get(path).expect(404);
      }
    }
    for (const path of purchaseRoutes(ada.id)) {
      await api(student).get(path).expect(200);
    }
  });

  test('answer 403 for a custom guardian role without invoice:readOwn and for staff holding invoice:read only', async ({
    api,
    app,
    pool,
    withPermissions,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);
    await purchasesOf(api, guardian, ada.id);
    await pool.query(
      `UPDATE "organizationRole" SET permission = $2
       WHERE "organizationId" = $1 AND role = 'guardian'`,
      [schools.orgA.id, guardianOnly]
    );
    const staff = await withPermissions(schools.orgA, ['invoice:read']);

    for (const path of purchaseRoutes(ada.id)) {
      await api(guardian).get(path).expect(403);
      await api(staff).get(path).expect(403);
    }
    await detailOf(api, guardian, ada.id);
  });
});

test.describe('a read-only portal', () => {
  test('rejects every non-GET method on every portal route', async ({
    api,
    app,
    schools,
  }) => {
    const { ada, guardianLogin } = await family(app, schools);
    const guardian = await signInAs(api, guardianLogin);
    const client = api(guardian);

    for (const path of everyRoute(ada.id)) {
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

  test('registers only GET handlers under the portal path, but the wallet writes', ({
    app,
  }) => {
    const handlers = portalHandlers(app);

    expect(handlers.length).toBeGreaterThan(0);
    expect(
      handlers
        .filter(({ method }) => method !== RequestMethod.GET)
        .map(({ name }) => name)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual([
      'WalletPortalController.release',
      'WalletPortalController.setAside',
      'WalletPortalController.setAutoPay',
      'WalletPortalController.spend',
    ]);
  });
});
