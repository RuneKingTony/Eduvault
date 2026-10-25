import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';

const ENTRIES = {
  seed: 'scripts/seed.ts',
  'seed-demo': 'scripts/seed-demo.ts',
} as const;

// Same bundling as the API: SWC keeps the decorator metadata Nest needs, and
// the output stays in apps/api so externalised packages resolve through its
// node_modules. emptyOutDir is off so the API bundle in dist survives. Each
// entry is built on its own: inlineDynamicImports cannot split two entries.
export default defineConfig(({ mode }) => {
  const name = mode === 'seed-demo' ? 'seed-demo' : 'seed';
  return {
    root: import.meta.dirname,
    cacheDir: `../../node_modules/.vite/apps/api-${name}`,
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
        entry: ENTRIES[name],
        name: name === 'seed' ? 'seed' : 'seedDemo',
        fileName: name,
        formats: ['cjs'],
      },
      rollupOptions: {
        external: (id: string) =>
          id.startsWith('node:') ||
          (/^[a-z@][\w/\-.]*$/i.test(id) && !id.startsWith('@eduvault/')),
        output: { inlineDynamicImports: true, entryFileNames: `${name}.cjs` },
      },
    },
  };
});
