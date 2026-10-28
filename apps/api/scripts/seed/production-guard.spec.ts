import {
  assertSeedAllowed,
  PRODUCTION_SEED_OPT_IN,
  ProductionSeedRefusedError,
} from './production-guard';

describe('assertSeedAllowed', () => {
  it('allows seeding outside production', () => {
    expect(() => assertSeedAllowed({})).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('refuses in production and names the opt-in', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(
      ProductionSeedRefusedError
    );
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(
      new RegExp(PRODUCTION_SEED_OPT_IN)
    );
  });

  it('refuses in production when the opt-in is anything but true', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', ALLOW_PRODUCTION_SEED: '1' })
    ).toThrow(ProductionSeedRefusedError);
  });

  it('allows production with the explicit opt-in', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'production',
        ALLOW_PRODUCTION_SEED: 'true',
      })
    ).not.toThrow();
  });
});
