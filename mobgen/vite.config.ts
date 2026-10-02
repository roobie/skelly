import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { TEST_POOL } from '../testPool.ts';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1000, // three.js; fine for a debug viewer
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        stress: fileURLToPath(new URL('./stress.html', import.meta.url)),
      },
    },
  },
  test: {
    ...TEST_POOL,
    include: ['test/**/*.test.ts'],
  },
});
