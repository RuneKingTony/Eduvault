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

  it('sizes the database pool and its connect wait, with defaults', () => {
    expect(loadEnv(valid)).toMatchObject({
      DATABASE_POOL_MAX: 20,
      DATABASE_CONNECT_TIMEOUT_MS: 10_000,
    });
    expect(
      loadEnv({
        ...valid,
        DATABASE_POOL_MAX: '5',
        DATABASE_CONNECT_TIMEOUT_MS: '3000',
      })
    ).toMatchObject({
      DATABASE_POOL_MAX: 5,
      DATABASE_CONNECT_TIMEOUT_MS: 3000,
    });
    for (const bad of ['0', '-1', 'many', '1.5']) {
      expect(() => loadEnv({ ...valid, DATABASE_POOL_MAX: bad })).toThrow(
        /DATABASE_POOL_MAX/
      );
      expect(() =>
        loadEnv({ ...valid, DATABASE_CONNECT_TIMEOUT_MS: bad })
      ).toThrow(/DATABASE_CONNECT_TIMEOUT_MS/);
    }
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

  describe('cookie domain', () => {
    const urlNames = [
      'BETTER_AUTH_URL',
      'WEB_ADMIN_URL',
      'WEB_PORTAL_URL',
    ] as const;
    const staging = {
      BETTER_AUTH_URL: 'https://api.staging.example.com',
      WEB_ADMIN_URL: 'https://admin.staging.example.com',
      WEB_PORTAL_URL: 'https://portal.staging.example.com',
    };

    it('is optional and leaves local hosts alone', () => {
      expect(loadEnv(valid).AUTH_COOKIE_DOMAIN).toBeUndefined();
    });

    it.each(['.staging.example.com', 'staging.example.com'])(
      'accepts %j when every app URL is under it',
      (domain) => {
        expect(
          loadEnv({ ...valid, ...staging, AUTH_COOKIE_DOMAIN: domain })
            .AUTH_COOKIE_DOMAIN
        ).toBe(domain);
      }
    );

    it.each(urlNames)(
      'names %s when its host is outside the domain',
      (name) => {
        const env = {
          ...valid,
          ...staging,
          [name]: 'https://app.other.example.org',
          AUTH_COOKIE_DOMAIN: '.staging.example.com',
        };
        expect(() => loadEnv(env)).toThrow(new RegExp(`${name}: Host must`));
        for (const other of urlNames.filter(
          (candidate) => candidate !== name
        )) {
          expect(() => loadEnv(env)).not.toThrow(
            new RegExp(`${other}: Host must`)
          );
        }
      }
    );

    it('does not match a host that only ends with the same letters', () => {
      expect(() =>
        loadEnv({
          ...valid,
          ...staging,
          WEB_ADMIN_URL: 'https://admin.notstaging.example.com',
          AUTH_COOKIE_DOMAIN: '.staging.example.com',
        })
      ).toThrow(/WEB_ADMIN_URL/);
    });

    it('reports a malformed URL as that variable, not a crash', () => {
      expect(() =>
        loadEnv({
          ...valid,
          WEB_ADMIN_URL: 'not a url',
          AUTH_COOKIE_DOMAIN: '.staging.example.com',
        })
      ).toThrow(/Invalid environment[\s\S]*WEB_ADMIN_URL/);
    });

    it('refuses a value that is not a hostname', () => {
      for (const bad of [
        '',
        'https://staging.example.com',
        'a b',
        '.',
        'com',
        '.com',
        '127.0.0.1',
      ]) {
        expect(() => loadEnv({ ...valid, AUTH_COOKIE_DOMAIN: bad })).toThrow(
          /AUTH_COOKIE_DOMAIN/
        );
      }
    });
  });

  describe('gateway encryption key', () => {
    const key = Buffer.alloc(32, 7).toString('base64');

    it('is optional, so a school that never connects Monnify needs none', () => {
      expect(loadEnv(valid).GATEWAY_ENCRYPTION_KEY).toBeUndefined();
    });

    it('takes 32 bytes of base64', () => {
      expect(
        loadEnv({ ...valid, GATEWAY_ENCRYPTION_KEY: key })
          .GATEWAY_ENCRYPTION_KEY
      ).toBe(key);
    });

    it.each([
      Buffer.alloc(16, 7).toString('base64'),
      Buffer.alloc(33, 7).toString('base64'),
      'not base64!',
      '',
    ])('refuses %j', (bad) => {
      expect(() => loadEnv({ ...valid, GATEWAY_ENCRYPTION_KEY: bad })).toThrow(
        /GATEWAY_ENCRYPTION_KEY/
      );
    });
  });
});
