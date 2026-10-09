import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';

// Same bundling as the API: SWC keeps the decorator metadata Nest needs, and
// the output stays in apps/api so externalised packages resolve through its
// node_modules. emptyOutDir is off so the API bundle in dist survives.
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-seed',
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
      entry: 'scripts/seed.ts',
      name: 'seed',
      fileName: 'seed',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith('node:') ||
        (/^[a-z@][\w/\-.]*$/i.test(id) && !id.startsWith('@eduvault/')),
      output: { inlineDynamicImports: true, entryFileNames: 'seed.cjs' },
    },
  },
});
