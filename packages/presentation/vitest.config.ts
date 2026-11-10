import { defineConfig } from 'vitest/config';
import { TEST_POOL } from '../../testPool.ts';

// A test here may reach engine internals through the engine's test-only subpath, which resolves only under this
// condition. See `docs/decisions/0009-content-defined-products.md`, "Refactor gate".
// Vitest gives each of its environments its own resolve options.
const testResolve = { resolve: { conditions: ['skelly-test'] } };

export default defineConfig({
  // biome-ignore lint/style/useNamingConvention: Vitest names its global-setup environment.
  environments: { client: testResolve, ssr: testResolve, __vitest__: testResolve },
  test: {
    ...TEST_POOL,
    include: ['test/**/*.test.ts'],
  },
});
