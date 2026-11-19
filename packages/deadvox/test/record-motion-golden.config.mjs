// @ts-nocheck -- see record-motion-golden.mjs, which this configures.
import { defineConfig } from 'vitest/config';

const resolve = { resolve: { conditions: ['skelly-test'] } };

export default defineConfig({
  environments: { client: resolve, ssr: resolve },
  define: {
    __SKELLY_FILE_HASHES__: '{}',
    __SKELLY_BUNDLE_STAMP__: 'undefined',
    __SKELLY_ADMISSION_FINGERPRINT__: 'undefined',
  },
  test: { include: ['test/record-motion-golden.mjs'], environment: 'node' },
});
