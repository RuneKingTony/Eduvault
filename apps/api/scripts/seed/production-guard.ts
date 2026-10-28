import { DEV_BOOTSTRAP_PASSWORD } from '../../src/app/common/auth/bootstrap-admin';

export const PRODUCTION_SEED_OPT_IN = 'ALLOW_PRODUCTION_SEED';

export class ProductionSeedRefusedError extends Error {
  constructor() {
    super(
      `Seeding creates accounts with the password ${DEV_BOOTSTRAP_PASSWORD}. Set ${PRODUCTION_SEED_OPT_IN}=true to run it with NODE_ENV=production`
    );
    this.name = 'ProductionSeedRefusedError';
  }
}

export function assertSeedAllowed(
  source: Record<string, string | undefined>
): void {
  if (
    source['NODE_ENV'] === 'production' &&
    source[PRODUCTION_SEED_OPT_IN] !== 'true'
  ) {
    throw new ProductionSeedRefusedError();
  }
}
