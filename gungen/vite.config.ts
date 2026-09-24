import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 }, // three.js; fine for a debug viewer
  test: {
    include: ['test/**/*.test.ts'],
  },
});
