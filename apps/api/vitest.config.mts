import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-unit',
  plugins: [nxViteTsPaths(), swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'api',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
  },
});
