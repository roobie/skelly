import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { alias: { '@mobgen': fileURLToPath(new URL('../mobgen/src', import.meta.url)) } },
  server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
});
