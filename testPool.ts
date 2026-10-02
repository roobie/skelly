// The suites are CPU-bound; leave room for Vite's transforms and the shared host.
// Vitest's native percentage budget gives this 7-logical-CPU VM 3 workers and
// a 2-core CI runner 1, while preserving fresh module/global state per file.
export const TEST_POOL = { maxWorkers: '40%', isolate: true } as const;
