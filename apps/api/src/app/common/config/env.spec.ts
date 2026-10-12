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

  describe('file store', () => {
    const s3 = { FILE_STORE_DRIVER: 's3', S3_BUCKET: 'b', S3_REGION: 'r' };

    it('defaults to postgres and ignores the S3 variables', () => {
      expect(loadEnv(valid)).toMatchObject({
        FILE_STORE_DRIVER: 'postgres',
        S3_FORCE_PATH_STYLE: false,
      });
      expect(loadEnv({ ...valid, S3_BUCKET: 'b' }).FILE_STORE_DRIVER).toBe(
        'postgres'
      );
    });

    it('names every missing variable when the driver is s3', () => {
      expect(() => loadEnv({ ...valid, FILE_STORE_DRIVER: 's3' })).toThrow(
        /S3_BUCKET[\s\S]*S3_REGION/
      );
    });

    it('takes an endpoint, path-style and a credential pair', () => {
      expect(
        loadEnv({
          ...valid,
          ...s3,
          S3_ENDPOINT: 'http://localhost:9100',
          S3_FORCE_PATH_STYLE: 'true',
          S3_ACCESS_KEY_ID: 'id',
          S3_SECRET_ACCESS_KEY: 'secret',
        })
      ).toMatchObject({
        FILE_STORE_DRIVER: 's3',
        S3_ENDPOINT: 'http://localhost:9100',
        S3_FORCE_PATH_STYLE: true,
      });
      expect(loadEnv({ ...valid, ...s3 }).S3_ACCESS_KEY_ID).toBeUndefined();
    });

    it('refuses one credential without the other', () => {
      expect(() =>
        loadEnv({ ...valid, ...s3, S3_ACCESS_KEY_ID: 'id' })
      ).toThrow(/S3_SECRET_ACCESS_KEY/);
      expect(() =>
        loadEnv({ ...valid, ...s3, S3_SECRET_ACCESS_KEY: 'secret' })
      ).toThrow(/S3_ACCESS_KEY_ID/);
    });

    it('refuses an unknown driver and a malformed endpoint', () => {
      expect(() => loadEnv({ ...valid, FILE_STORE_DRIVER: 'disk' })).toThrow(
        /FILE_STORE_DRIVER/
      );
      expect(() =>
        loadEnv({ ...valid, ...s3, S3_ENDPOINT: 'not a url' })
      ).toThrow(/S3_ENDPOINT/);
    });
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
