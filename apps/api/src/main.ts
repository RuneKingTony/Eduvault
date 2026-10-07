import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';
import { loadEnv } from './app/common/config/env';

async function bootstrap() {
  const env = loadEnv();
  // Better Auth parses its own bodies; Nest's parser would consume them first.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app, env);
  await app.listen(env.PORT);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
