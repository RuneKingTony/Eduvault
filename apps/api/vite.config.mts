import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';

// Output stays inside apps/api so externalised packages resolve through this
// app's own node_modules under pnpm's strict layout.
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  plugins: [nxViteTsPaths(), swc.vite({ module: { type: 'es6' } })],
  resolve: { conditions: ['node', 'import'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: true,
    commonjsOptions: { transformMixedEsModules: true },
    lib: {
      entry: 'src/main.ts',
      name: 'api',
      fileName: 'main',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith('node:') ||
        (/^[a-z@][\w/\-.]*$/i.test(id) && !id.startsWith('@eduvault/')),
      output: { inlineDynamicImports: true, entryFileNames: 'main.cjs' },
    },
  },
});
