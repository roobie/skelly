import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const BUNDLE_STAMP_DEFINE = '__DEADVOX_BUNDLE_STAMP__';
const ADMISSION_FINGERPRINT_DEFINE = '__DEADVOX_ADMISSION_FINGERPRINT__';

export default defineConfig({
  base: './',
  define: Object.fromEntries([
    [BUNDLE_STAMP_DEFINE, 'undefined'],
    [ADMISSION_FINGERPRINT_DEFINE, 'undefined'],
  ]),
  resolve: { alias: { '@mobgen': fileURLToPath(new URL('../mobgen/src', import.meta.url)) } },
  server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
});
