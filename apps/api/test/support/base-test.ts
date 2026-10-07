import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { Pool } from 'pg';
import request from 'supertest';
import { test as vitestTest } from 'vitest';
import type { Campus } from '@eduvault/api-contract';
import { AppModule } from '../../src/app/app.module';
import type { AppAuth } from '../../src/app/common/auth';
import { loadEnv } from '../../src/app/common/config/env';
import { configureApp } from '../../src/app/configure-app';

const ORIGIN = 'http://localhost:4200';
export const PASSWORD = 'correct-horse-battery';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  cookie: string;
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
  owner: TestUser;
}

type AddMemberOptions = { campuses?: Array<Pick<Campus, 'id'>> };

const cookieFrom = (setCookie: string[] | string | undefined): string =>
  [setCookie ?? []]
    .flat()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

const headersFor = (cookie: string) => new Headers({ cookie, origin: ORIGIN });

interface Fixtures {
  app: INestApplication;
  pool: Pool;
  resetDatabase: undefined;
  /** supertest against the app, signed in as `user` when given. */
  api: (user?: Pick<TestUser, 'cookie'>) => {
    get: (path: string) => request.Test;
    post: (path: string) => request.Test;
    patch: (path: string) => request.Test;
    delete: (path: string) => request.Test;
  };
  /** Registers through the real endpoint; autoSignIn yields the cookie. */
  signUp: (input?: { email?: string; name?: string }) => Promise<TestUser>;
  /** Fresh session for the user; the default-school hook applies on creation. */
  signIn: (user: TestUser) => Promise<TestUser>;
  setActiveOrganization: (
    user: TestUser,
    organizationId: string
  ) => Promise<void>;
  setActiveCampus: (user: TestUser, campusId: string) => Promise<void>;
  createOrganization: (
    owner: TestUser,
    name?: string
  ) => Promise<TestOrganization>;
  /** Creates a campus through the API as an owner or admin of the school. */
  createCampus: (
    org: TestOrganization,
    name?: string,
    actor?: TestUser
  ) => Promise<Campus>;
  /** Adds a school member and, optionally, assigns them to campuses. */
  addMember: (
    org: TestOrganization,
    user: TestUser,
    role: 'owner' | 'admin' | 'teacher' | 'student',
    options?: AddMemberOptions
  ) => Promise<TestUser>;
  /** Makes the user a platform admin (admin plugin `user.role = 'admin'`). */
  promoteToAdmin: (user: TestUser) => Promise<TestUser>;
}

export const baseTest = vitestTest.extend<Fixtures>({
  app: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const app = moduleRef.createNestApplication({ bodyParser: false });
      configureApp(app, loadEnv());
      await app.init();
      await use(app);
      await app.close();
    },
    { scope: 'file' },
  ],

  pool: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
      await use(pool);
      await pool.end();
    },
    { scope: 'file' },
  ],

  resetDatabase: [
    async ({ pool }, use) => {
      await pool.query(
        'TRUNCATE TABLE "user", "organization", "verification" RESTART IDENTITY CASCADE'
      );
      await use(undefined);
    },
    { auto: true },
  ],

  api: async ({ app }, use) => {
    await use((user) => {
      const http = () => request(app.getHttpServer());
      const withAuth = (req: request.Test) => {
        req.set('Origin', ORIGIN);
        return user ? req.set('Cookie', user.cookie) : req;
      };
      return {
        get: (path) => withAuth(http().get(path)),
        post: (path) => withAuth(http().post(path)),
        patch: (path) => withAuth(http().patch(path)),
        delete: (path) => withAuth(http().delete(path)),
      };
    });
  },

  signUp: async ({ api }, use) => {
    await use(async (input = {}) => {
      const email = input.email ?? `user-${randomUUID()}@example.test`;
      const res = await api()
        .post('/api/auth/sign-up/email')
        .send({ name: input.name ?? 'Test User', email, password: PASSWORD })
        .expect(200);
      return {
        id: (res.body as { user: { id: string } }).user.id,
        email,
        password: PASSWORD,
        cookie: cookieFrom(res.headers['set-cookie']),
      };
    });
  },

  signIn: async ({ api }, use) => {
    await use(async (user) => {
      const res = await api()
        .post('/api/auth/sign-in/email')
        .send({ email: user.email, password: user.password })
        .expect(200);
      user.cookie = cookieFrom(res.headers['set-cookie']);
      return user;
    });
  },

  setActiveOrganization: async ({ api }, use) => {
    await use(async (user, organizationId) => {
      await api(user)
        .post('/api/auth/organization/set-active')
        .send({ organizationId })
        .expect(200);
    });
  },

  setActiveCampus: async ({ api }, use) => {
    await use(async (user, campusId) => {
      await api(user)
        .post('/api/auth/organization/set-active-team')
        .send({ teamId: campusId })
        .expect(200);
    });
  },

  createOrganization: async ({ app, signIn }, use) => {
    await use(async (owner, name = `School ${randomUUID().slice(0, 8)}`) => {
      const { api } = app.get(AuthService<AppAuth>);
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`;
      const org = await api.createOrganization({
        body: { name, slug, userId: owner.id },
      });
      await signIn(owner);
      return { id: org.id, name, slug, owner };
    });
  },

  createCampus: async ({ api, setActiveOrganization }, use) => {
    await use(
      async (org, name = `Campus ${randomUUID().slice(0, 6)}`, actor) => {
        const user = actor ?? org.owner;
        await setActiveOrganization(user, org.id);
        const res = await api(user)
          .post('/campuses')
          .send({ name })
          .expect(201);
        return res.body as Campus;
      }
    );
  },

  addMember: async ({ app, signIn }, use) => {
    await use(async (org, user, role, options = {}) => {
      const { api } = app.get(AuthService<AppAuth>);
      await api.addMember({
        body: { userId: user.id, organizationId: org.id, role },
      });
      for (const campus of options.campuses ?? []) {
        await api.addTeamMember({
          body: { teamId: campus.id, userId: user.id },
          headers: headersFor(org.owner.cookie),
        });
      }
      return signIn(user);
    });
  },

  promoteToAdmin: async ({ pool, signIn }, use) => {
    await use(async (user) => {
      await pool.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [
        user.id,
      ]);
      return signIn(user);
    });
  },
});

export { expect } from 'vitest';
