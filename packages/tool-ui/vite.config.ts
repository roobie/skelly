import { defineConfig } from 'vitest/config';
import { TEST_POOL } from '../../testPool.ts';

export default defineConfig({ test: { ...TEST_POOL, include: ['test/**/*.test.ts'] } });
