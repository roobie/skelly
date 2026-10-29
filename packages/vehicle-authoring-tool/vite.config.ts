import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    __DEADVOX_BUNDLE_STAMP__: 'undefined',
    __DEADVOX_ADMISSION_FINGERPRINT__: 'undefined',
  },
  resolve: { alias: { '@mobgen': fileURLToPath(new URL('../mobgen/src', import.meta.url)) } },
  server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
});
