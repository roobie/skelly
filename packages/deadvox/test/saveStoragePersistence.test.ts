import { afterEach, expect, it, vi } from 'vitest';
import { SaveStorage } from '../src/game/saveStorage.ts';

afterEach(() => vi.unstubAllGlobals());

it('startup queries persisted once and never requests persistence', async () => {
  const persisted = vi.fn().mockResolvedValue(false);
  const persist = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('navigator', { storage: { persisted, persist } });
  vi.stubGlobal(
    'Worker',
    class {
      onmessage: ((event: MessageEvent) => void) | undefined;
      onerror: ((event: ErrorEvent) => void) | undefined;
      onmessageerror: ((event: MessageEvent) => void) | undefined;
      postMessage(message: { id: number; operation: string }): void {
        expect(message.operation).toBe('probe');
        queueMicrotask(() =>
          this.onmessage?.(
            new MessageEvent('message', {
              data: { id: message.id, result: { backend: 'indexeddb' } },
            }),
          ),
        );
      }
      terminate(): void {
        // Probe-only fake: its response microtask has finished; there is no worker process.
      }
    },
  );
  const storage = new SaveStorage();
  try {
    const status = await storage.status();
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
    expect(status.persistent).toBe(false);
  } finally {
    storage.close();
  }
});
