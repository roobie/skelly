import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './', // served from /skelly/deadvox/ on GitHub Pages
  build: {
    chunkSizeWarningLimit: 1000, // three.js
    rollupOptions: { input: ['index.html', 'sounds.html'] },
  },
  worker: { format: 'es' },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
