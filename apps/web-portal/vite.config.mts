import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web-portal',
  server: { port: 4201, strictPort: true, host: 'localhost' },
  preview: { port: 4201, strictPort: true, host: 'localhost' },
  plugins: [react(), tailwindcss(), nxViteTsPaths()],
  build: {
    outDir: '../../dist/apps/web-portal',
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, warn) {
        // zod ships /* @__PURE__ */ annotations Rollup cannot place; harmless.
        if (warning.code === 'INVALID_ANNOTATION') return;
        warn(warning);
      },
    },
  },
});
