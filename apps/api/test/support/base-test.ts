import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { Pool } from 'pg';
import request from 'supertest';
import { test as vitestTest } from 'vitest';
import {
  ACTING_ORG_HEADER,
  ACTING_REASON_HEADER,
  encodeActingReason,
  type Campus,
  type CreateSchoolInput,
  type CreateSchoolResult,
} from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { AppModule } from '../../src/app/app.module';
import { AccountService, type AppAuth } from '../../src/app/common/auth';
import { castToBetterAuthRoles } from '../../src/app/common/auth/better-auth-roles';
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

interface AddMemberInput {
  roles: string[];
  campuses?: Pick<Campus, 'id'>[];
}

interface NewRole {
  slug: string;
  permissions: readonly Permission[];
  label?: string;
}

interface CampusScopeInput {
  campuses?: Pick<Campus, 'id'>[];
}

const cookieFrom = (setCookie: string[] | string | undefined): string =>
  [setCookie ?? []]
    .flat()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

let nextHost = 0;
const nextAddress = () => {
  nextHost = (nextHost + 1) % 250;
  return `203.0.113.${nextHost}`;
};

export const acting = (organizationId: string, reason?: string) => ({
  [ACTING_ORG_HEADER]: organizationId,
  ...(reason === undefined
    ? {}
    : { [ACTING_REASON_HEADER]: encodeActingReason(reason) }),
});

interface AuditRowFilter {
  organizationId?: string;
  kind?: 'acting' | 'platform';
  method?: string;
  action?: string;
}

interface AuditLogRow {
  id: string;
  kind: string;
  actor_user_id: string;
  organization_id: string | null;
  method: string | null;
  action: string | null;
  path: string;
  status: number;
  reason: string | null;
}

const DEADLINE_MS = 3000;
const DEADLOCK = '40P01';

export async function waitForAuditRows(
  pool: Pool,
  filter: AuditRowFilter,
  count: number
): Promise<AuditLogRow[]> {
  const conditions: string[] = [];
  const values: string[] = [];
  for (const [column, value] of [
    ['organization_id', filter.organizationId],
    ['kind', filter.kind],
    ['method', filter.method],
    ['action', filter.action],
  ] as const) {
    if (value !== undefined) {
      values.push(value);
      conditions.push(`${column} = $${values.length}`);
    }
  }
  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const deadline = Date.now() + DEADLINE_MS;
  for (;;) {
    const { rows } = await pool.query<AuditLogRow>(
      `SELECT id, kind, actor_user_id, organization_id, method, action, path, status, reason
       FROM audit_log ${where} ORDER BY created_at, id`,
      values
    );
    if (rows.length >= count || Date.now() > deadline) {
      return rows;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const headersFor = (cookie: string) => new Headers({ cookie, origin: ORIGIN });

export interface Fixtures {
  app: INestApplication;
  pool: Pool;
  resetDatabase: undefined;
  /** supertest against the app, signed in as `user` when given. */
  api: (user?: Pick<TestUser, 'cookie'>) => {
    get: (path: string) => request.Test;
    post: (path: string) => request.Test;
    patch: (path: string) => request.Test;
    put: (path: string) => request.Test;
    delete: (path: string) => request.Test;
  };
  createUser: (input?: {
    email?: string;
    name?: string;
    mustChangePassword?: boolean;
  }) => Promise<TestUser>;
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
    input: AddMemberInput
  ) => Promise<TestUser>;
  createRole: (org: TestOrganization, role: NewRole) => Promise<void>;
  withPermissions: (
    org: TestOrganization,
    permissions: readonly Permission[],
    input?: CampusScopeInput
  ) => Promise<TestUser>;
  makeSuperAdmin: (user: TestUser) => Promise<TestUser>;
  createSchoolViaPlatform: (
    superAdmin: TestUser,
    body: Partial<CreateSchoolInput> & Pick<CreateSchoolInput, 'ownerEmail'>
  ) => Promise<CreateSchoolResult>;
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
      // The previous test's acting audit row is written after its response and
      // can deadlock with this truncate; the retry lets that insert finish.
      for (let attempt = 1; ; attempt += 1) {
        try {
          await pool.query(
            'TRUNCATE TABLE "user", "organization", "verification" RESTART IDENTITY CASCADE'
          );
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== DEADLOCK || attempt >= 3) {
            throw error;
          }
        }
      }
      await use(undefined);
    },
    { auto: true },
  ],

  api: async ({ app }, use) => {
    const http = () => request(app.getHttpServer());
    await use((user) => {
      const withAuth = (req: request.Test) => {
        req.set('Origin', ORIGIN);
        return user ? req.set('Cookie', user.cookie) : req;
      };
      return {
        get: (path) => withAuth(http().get(path)),
        post: (path) => withAuth(http().post(path)),
        patch: (path) => withAuth(http().patch(path)),
        put: (path) => withAuth(http().put(path)),
        delete: (path) => withAuth(http().delete(path)),
      };
    });
  },

  createUser: async ({ app, signIn }, use) => {
    const accounts = app.get(AccountService);
    await use(async (input = {}) => {
      const email = input.email ?? `user-${randomUUID()}@example.test`;
      const { user } = await accounts.createAccount({
        name: input.name ?? 'Test User',
        email,
        password: PASSWORD,
        mustChangePassword: input.mustChangePassword ?? false,
      });
      return signIn({ id: user.id, email, password: PASSWORD, cookie: '' });
    });
  },

  signIn: async ({ api }, use) => {
    await use(async (user) => {
      const res = await api()
        .post('/api/auth/sign-in/email')
        .set('x-forwarded-for', nextAddress())
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
      const slug = `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`;
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
    await use(async (org, user, { roles, campuses = [] }) => {
      const { api } = app.get(AuthService<AppAuth>);
      await api.addMember({
        body: {
          userId: user.id,
          organizationId: org.id,
          role: castToBetterAuthRoles(roles),
        },
      });
      for (const campus of campuses) {
        await api.addTeamMember({
          body: { teamId: campus.id, userId: user.id },
          headers: headersFor(org.owner.cookie),
        });
      }
      return signIn(user);
    });
  },

  createRole: async ({ pool }, use) => {
    await use(async (org, { slug, permissions, label = slug }) => {
      await pool.query(
        `INSERT INTO "organizationRole"
           ("organizationId", role, permission, label, source)
         VALUES ($1, $2, $3, $4, 'custom')`,
        [org.id, slug, JSON.stringify(toPermissionMap(permissions)), label]
      );
    });
  },

  withPermissions: async ({ createUser, createRole, addMember }, use) => {
    await use(async (org, permissions, { campuses = [] } = {}) => {
      const slug = `role-${randomUUID().slice(0, 8)}`;
      await createRole(org, { slug, permissions });
      return addMember(org, await createUser(), { roles: [slug], campuses });
    });
  },

  makeSuperAdmin: async ({ pool, signIn }, use) => {
    await use(async (user) => {
      await pool.query(`UPDATE "user" SET role = 'superadmin' WHERE id = $1`, [
        user.id,
      ]);
      return signIn(user);
    });
  },

  createSchoolViaPlatform: async ({ api }, use) => {
    await use(async (superAdmin, body) => {
      const suffix = randomUUID().slice(0, 6);
      const res = await api(superAdmin)
        .post('/platform/schools')
        .send({
          name: `School ${suffix}`,
          slug: `school-${suffix}`,
          admissionPrefix: 'SCH',
          ownerName: 'Owner',
          ...body,
        })
        .expect(201);
      return res.body as CreateSchoolResult;
    });
  },
});

export { expect } from 'vitest';
