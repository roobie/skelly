import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { pagesAnalyticsPlugin } from '../../pagesAnalyticsPlugin.ts';
import { TEST_POOL } from '../../testPool.ts';

const mobgenSrc = fileURLToPath(new URL('../mobgen/src/', import.meta.url));
// The manual sweep run has no per-test timer: its work is bounded, so only the workflow's job timeout caps a hang.
// biome-ignore lint/style/noProcessEnv: the sweep gate is env-driven; see test/sweeps.ts.
const sweepTimeout = process.env.GUNGEN_SWEEPS === '1' ? { testTimeout: 0 } : {};

export default defineConfig({
  base: './',
  resolve: { alias: { '@mobgen/': mobgenSrc } },
  // biome-ignore lint/style/noProcessEnv: only the Pages deploy opts into production analytics.
  plugins: [pagesAnalyticsPlugin(process.env.PAGES_ANALYTICS === '1')],
  build: { chunkSizeWarningLimit: 1000 }, // three.js; fine for a debug viewer
  test: {
    ...TEST_POOL,
    include: ['test/**/*.test.ts'],
    ...sweepTimeout,
  },
});
