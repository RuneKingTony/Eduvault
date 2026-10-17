import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/policy',
  test: {
    name: 'policy',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    maxWorkers: 4,
    passWithNoTests: false,
  },
});
