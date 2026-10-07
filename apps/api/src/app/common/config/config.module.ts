import { Global, Module } from '@nestjs/common';
import { ENV_TOKEN, loadEnv } from './env';

@Global()
@Module({
  providers: [{ provide: ENV_TOKEN, useFactory: () => loadEnv() }],
  exports: [ENV_TOKEN],
})
export class ConfigModule {}
