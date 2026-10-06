import process from 'node:process';
import { defineConfig } from 'vitest/config';
import { pagesAnalyticsPlugin } from '../pagesAnalyticsPlugin.ts';
import { TEST_POOL } from '../testPool.ts';

export default defineConfig({
  base: './',
  // biome-ignore lint/style/noProcessEnv: only the Pages deploy opts into production analytics.
  plugins: [pagesAnalyticsPlugin(process.env.PAGES_ANALYTICS === '1')],
  build: { chunkSizeWarningLimit: 1000 }, // three.js; fine for a debug viewer
  test: {
    ...TEST_POOL,
    include: ['test/**/*.test.ts'],
  },
});
