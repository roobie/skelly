import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error browser harness module has no types
import { auditModelLoads, modelLoadAuditPlugin } from './browser/model-load-audit.mjs';

type Middleware = (request: unknown, response: unknown) => void;

const registered: Middleware[] = [];
modelLoadAuditPlugin.configureServer({
  middlewares: { use: (_path: string, fn: Middleware) => registered.push(fn) },
});

const beacon = (record: object): void => {
  const [handle] = registered;
  if (!handle) {
    throw new Error('audit middleware is registered');
  }
  const handlers = new Map<string, (chunk?: string) => void>();
  handle(
    { setEncoding: () => undefined, on: (name: string, fn: (chunk?: string) => void) => handlers.set(name, fn) },
    { end: () => undefined },
  );
  handlers.get('data')?.(JSON.stringify(record));
  handlers.get('end')?.();
};

const closeWith = async (records: object[]): Promise<void> => {
  const audit = await auditModelLoads({
    addInitScript: async () => undefined,
    on: () => undefined,
    close: async () => undefined,
  });
  records.forEach(beacon);
  await audit.close();
};

const modelAbort = { event: 'asset-error', model: 'machete', url: '/src/content/base/assets/models/machete.glb' };

describe('model load audit', () => {
  afterEach(() => vi.restoreAllMocks());

  // The page stamps `unloaded` on each record it sends, so these tests feed beacons the way a page would.
  it('excuses a model fetch that its own document aborted by unloading', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await closeWith([
      { event: 'pagehide', document: 7, at: 100, unloaded: true },
      { ...modelAbort, document: 7, at: 100, unloaded: true },
    ]);
  });

  it('rejects a model load error that precedes pagehide within the same millisecond', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(
      closeWith([
        { ...modelAbort, document: 7, at: 100, unloaded: false },
        { event: 'pagehide', document: 7, at: 100, unloaded: true },
      ]),
    ).rejects.toThrow('unclassified model load failure');
  });

  it('does not excuse a model load error on a document that never unloaded', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(
      closeWith([
        { event: 'pagehide', document: 6, at: 100, unloaded: true },
        { ...modelAbort, document: 7, at: 100, unloaded: false },
      ]),
    ).rejects.toThrow('unclassified model load failure');
  });
});
