import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';

// Bundled like the seed: the output stays in apps/api so externalised packages
// resolve through its node_modules, and emptyOutDir is off so the API bundle survives.
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-bootstrap-admin',
  plugins: [nxViteTsPaths(), swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions: ['node', 'import'] },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'node24',
    minify: false,
    sourcemap: true,
    commonjsOptions: { transformMixedEsModules: true },
    lib: {
      entry: 'scripts/bootstrap-admin.ts',
      name: 'bootstrapAdmin',
      fileName: 'bootstrap-admin',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith('node:') ||
        (/^[a-z@][\w/\-.]*$/i.test(id) && !id.startsWith('@eduvault/')),
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'bootstrap-admin.cjs',
      },
    },
  },
});
