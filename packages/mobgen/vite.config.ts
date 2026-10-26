import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { pagesAnalyticsPlugin } from '../../pagesAnalyticsPlugin.ts';
import { TEST_POOL } from '../../testPool.ts';

// The manual sweep run has no per-test timer: its work is bounded, so only the workflow's job timeout caps a hang.
// biome-ignore lint/style/noProcessEnv: the sweep gate is env-driven; see test/sweeps.ts.
const sweepTimeout = process.env.MOBGEN_SWEEPS === '1' ? { testTimeout: 0, hookTimeout: 0 } : {};

export default defineConfig({
  base: './',
  // biome-ignore lint/style/noProcessEnv: only the Pages deploy opts into production analytics.
  plugins: [pagesAnalyticsPlugin(process.env.PAGES_ANALYTICS === '1')],
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
    ...sweepTimeout,
  },
});
