import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-integration',
  plugins: [nxViteTsPaths(), swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'api-integration',
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.spec.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      BETTER_AUTH_SECRET: 'integration-test-secret-at-least-32-characters',
      BETTER_AUTH_URL: 'http://localhost:3000',
      WEB_ADMIN_URL: 'http://localhost:4200',
      WEB_PORTAL_URL: 'http://localhost:4201',
    },
  },
});
