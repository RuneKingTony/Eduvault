import { defineConfig, devices } from '@playwright/test';
import { env, artifactDir } from './src/support/env';

export default defineConfig({
  testDir: './src/specs',
  outputDir: `${artifactDir}/playwright`,
  globalSetup: './src/support/global-setup.ts',
  reporter: [['list'], ['./src/support/ledger-reporter.ts']],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'api', testMatch: '*.api.spec.ts' },
    {
      name: 'web-admin',
      testMatch: '*.web.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: env.adminUrl },
    },
    {
      name: 'web-portal',
      testMatch: '*.web.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: env.portalUrl },
    },
  ],
});
