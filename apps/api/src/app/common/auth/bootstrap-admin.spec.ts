import { parseBootstrapEnv } from './bootstrap-admin';

describe('parseBootstrapEnv', () => {
  const valid = {
    BOOTSTRAP_ADMIN_EMAIL: 'admin@eduvault.test',
    BOOTSTRAP_ADMIN_PASSWORD: 'password123',
  };

  it('reads both variables', () => {
    expect(parseBootstrapEnv(valid)).toEqual({
      email: 'admin@eduvault.test',
      password: 'password123',
    });
  });

  it('names a missing variable', () => {
    expect(() =>
      parseBootstrapEnv({ BOOTSTRAP_ADMIN_EMAIL: valid.BOOTSTRAP_ADMIN_EMAIL })
    ).toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
    expect(() =>
      parseBootstrapEnv({
        BOOTSTRAP_ADMIN_PASSWORD: valid.BOOTSTRAP_ADMIN_PASSWORD,
      })
    ).toThrow(/BOOTSTRAP_ADMIN_EMAIL/);
  });

  it('refuses when both are missing', () => {
    expect(() => parseBootstrapEnv({})).toThrow(
      /BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD/
    );
  });

  it('says a set but unusable value is not valid rather than missing', () => {
    const tooShort = { ...valid, BOOTSTRAP_ADMIN_PASSWORD: 'short' };
    expect(() => parseBootstrapEnv(tooShort)).toThrow(
      /BOOTSTRAP_ADMIN_PASSWORD is not valid/
    );
    expect(() => parseBootstrapEnv(tooShort)).not.toThrow(/first/);
    expect(() =>
      parseBootstrapEnv({ ...valid, BOOTSTRAP_ADMIN_EMAIL: 'not-an-email' })
    ).toThrow(/BOOTSTRAP_ADMIN_EMAIL is not valid/);
  });

  it('refuses the local defaults in production', () => {
    const production = { ...valid, NODE_ENV: 'production' };
    expect(() => parseBootstrapEnv(production)).toThrow(/real/);
    expect(() =>
      parseBootstrapEnv({
        ...production,
        BOOTSTRAP_ADMIN_EMAIL: 'root@school.example.com',
      })
    ).toThrow(/real/);
    expect(() =>
      parseBootstrapEnv({
        BOOTSTRAP_ADMIN_EMAIL: 'root@school.example.com',
        BOOTSTRAP_ADMIN_PASSWORD: 'a-long-private-pw',
        NODE_ENV: 'production',
      })
    ).not.toThrow();
  });
});
