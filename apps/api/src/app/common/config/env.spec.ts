import { loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5434/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  WEB_ADMIN_URL: 'http://localhost:4200',
  WEB_PORTAL_URL: 'http://localhost:4201',
};

describe('loadEnv', () => {
  it('applies defaults and coerces the port', () => {
    expect(loadEnv({ ...valid, PORT: '4000' })).toMatchObject({
      PORT: 4000,
      NODE_ENV: 'development',
    });
    expect(loadEnv(valid).PORT).toBe(3000);
  });

  it('names every invalid variable in one error', () => {
    expect(() =>
      loadEnv({ ...valid, DATABASE_URL: '', BETTER_AUTH_SECRET: 'short' })
    ).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/);
  });

  it('refuses to boot when a required variable is missing', () => {
    const { WEB_PORTAL_URL: _omitted, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/WEB_PORTAL_URL/);
  });

  it('accepts an ISO SEED_TODAY and leaves it unset by default', () => {
    expect(loadEnv(valid).SEED_TODAY).toBeUndefined();
    expect(loadEnv({ ...valid, SEED_TODAY: '2026-10-07' }).SEED_TODAY).toBe(
      '2026-10-07'
    );
    expect(() => loadEnv({ ...valid, SEED_TODAY: 'yesterday' })).toThrow(
      /SEED_TODAY/
    );
  });

  it('keeps invitee trust off by default and refuses it in production', () => {
    expect(loadEnv(valid).E2E_TRUST_INVITEES).toBe(false);
    expect(loadEnv({ ...valid, E2E_TRUST_INVITEES: 'true' })).toMatchObject({
      E2E_TRUST_INVITEES: true,
    });
    expect(() =>
      loadEnv({ ...valid, NODE_ENV: 'production', E2E_TRUST_INVITEES: 'true' })
    ).toThrow(/E2E_TRUST_INVITEES/);
  });

  it('keeps the sign-in rate limit off unless asked for', () => {
    expect(loadEnv(valid).AUTH_RATE_LIMIT).toBe(false);
    expect(loadEnv({ ...valid, AUTH_RATE_LIMIT: 'true' })).toMatchObject({
      AUTH_RATE_LIMIT: true,
    });
    expect(() => loadEnv({ ...valid, AUTH_RATE_LIMIT: 'yes' })).toThrow(
      /AUTH_RATE_LIMIT/
    );
  });
});
