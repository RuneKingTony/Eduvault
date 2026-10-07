import type { INestApplication } from '@nestjs/common';
import type { Env } from './common/config/env';
import { ErrorFilter } from './common/http/error.filter';

/** Everything main.ts and the integration tests must apply identically. */
export function configureApp(app: INestApplication, env: Env): void {
  app.enableCors({
    origin: [env.WEB_ADMIN_URL, env.WEB_PORTAL_URL],
    credentials: true,
  });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
}
