import { defineConfig } from 'vitest/config';
import { TEST_POOL } from '../testPool.ts';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 }, // three.js; fine for a debug viewer
  test: {
    ...TEST_POOL,
    include: ['test/**/*.test.ts'],
  },
});
