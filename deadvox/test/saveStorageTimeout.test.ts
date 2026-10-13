import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SaveBackendPreference, SaveStorage } from '../src/game/saveStorage.ts';

type Operation = 'probe' | 'read' | 'commit';
interface Request {
  id: number;
  operation: Operation;
  slot?: string;
  generation?: number;
  payload?: ArrayBuffer;
}
interface Reply {
  id: number;
  result?: unknown;
}

// Advancing time without dispatching tasks models a main-thread stall independently of worker replies.
const createMainClock = () => {
  let nowRealMs = 0;
  let nextId = 0;
  const timers = new Map<number, { due: number; callback: () => void }>();
  return {
    get nowRealMs(): number {
      return nowRealMs;
    },
    setTimeout(callback: () => void, delay = 0): number {
      nextId += 1;
      timers.set(nextId, { due: nowRealMs + delay, callback });
      return nextId;
    },
    clearTimeout(id: number): void {
      timers.delete(id);
    },
    advanceWithoutTasks(milliseconds: number): void {
      nowRealMs += milliseconds;
    },
    runDue(): number {
      let ran = 0;
      const due = [...timers].filter(([, scheduled]) => scheduled.due <= nowRealMs);
      for (const [id, timer] of due) {
        if (timers.delete(id)) {
          ran += 1;
          timer.callback();
        }
      }
      return ran;
    },
    get nextDue(): number {
      if (timers.size === 0) {
        throw new Error('No timer to dispatch');
      }
      return Math.min(...[...timers.values()].map(({ due }) => due));
    },
    get pendingTimers(): number {
      return timers.size;
    },
  };
};

const clients: SaveStorage[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) {
    client.close();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const DEADLINE = 100;
const PAYLOAD = new Uint8Array([1, 2, 3]);
const beginRequest = async (operation: Operation = 'commit', backend: SaveBackendPreference = 'indexeddb') => {
  const clock = createMainClock();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(performance, 'now').mockImplementation(() => clock.nowRealMs);
  vi.stubGlobal('setTimeout', clock.setTimeout);
  vi.stubGlobal('clearTimeout', clock.clearTimeout);
  vi.stubGlobal('navigator', {
    storage: {},
    locks: {
      request: (_name: string, _options: unknown, callback: () => unknown) => Promise.resolve(callback()),
    },
  });
  let worker: FakeWorker | undefined;
  let requestPosted: ((request: Request) => void) | undefined;
  const whenRequest = new Promise<Request>((resolve) => {
    requestPosted = resolve;
  });
  class FakeWorker {
    onmessage: ((event: MessageEvent<Reply>) => void) | undefined;
    onerror: ((event: ErrorEvent) => void) | undefined;
    onmessageerror: (() => void) | undefined;
    terminated = false;
    backendCommitted = false;
    private target: Request | undefined;
    private queuedReply: Reply | undefined;

    constructor() {
      worker = this;
    }
    postMessage(message: Request): void {
      if (message.operation === operation) {
        this.target = message;
        requestPosted!(message);
        return;
      }
      const result = message.operation === 'probe' ? { backend } : { a: null, b: null };
      queueMicrotask(() => this.deliver({ id: message.id, result }));
    }
    queueCommitReply(): void {
      if (this.target?.operation !== 'commit') {
        throw new Error('No pending commit');
      }
      this.backendCommitted = true;
      this.queuedReply = {
        id: this.target.id,
        result: { slot: this.target.slot, generation: this.target.generation },
      };
    }
    deliverQueuedReply(): void {
      if (!this.queuedReply) {
        throw new Error('No queued reply');
      }
      this.deliver(this.queuedReply);
      this.queuedReply = undefined;
    }
    private deliver(data: Reply): void {
      if (!this.terminated) {
        this.onmessage?.({ data } as MessageEvent<Reply>);
      }
    }
    terminate(): void {
      this.terminated = true;
    }
  }
  vi.stubGlobal('Worker', FakeWorker);
  const storage = new SaveStorage({ backend, requestTimeoutMs: DEADLINE });
  clients.push(storage);
  if (operation !== 'probe') {
    await storage.status();
    if (clock.pendingTimers !== 0) {
      throw new Error('Startup retained a timer');
    }
  }
  let pending: Promise<unknown>;
  if (operation === 'probe') {
    pending = storage.status();
  } else if (operation === 'read') {
    pending = storage.readRawSlots('a'.repeat(64));
  } else {
    pending = storage.save('a'.repeat(64), async () => PAYLOAD);
  }
  const outcome = pending.then(
    (result) => ({ kind: 'success' as const, result }),
    (error: unknown) => ({ kind: 'error' as const, error }),
  );
  const request = await whenRequest;
  if (!worker || request.operation !== operation || clock.pendingTimers !== 1) {
    throw new Error('Fixture did not reach its pending worker request');
  }
  return { clock, worker, outcome, request, warning };
};

const timeoutError = async (outcome: Awaited<ReturnType<typeof beginRequest>>['outcome']): Promise<Error> => {
  const result = await outcome;
  if (result.kind !== 'error' || !(result.error instanceof Error)) {
    throw new Error('Expected a rejected request');
  }
  return result.error;
};

describe('save worker deadlines', () => {
  it.each(['waiting', 'grace'] as const)('a matching queued reply cancels the %s timer', async (phase) => {
    const { clock, worker, outcome, warning } = await beginRequest();
    clock.advanceWithoutTasks(10);
    worker.queueCommitReply();
    if (phase === 'grace') {
      clock.advanceWithoutTasks(1000);
      expect(clock.runDue()).toBe(1);
      expect(worker.terminated).toBe(false);
      expect(clock.pendingTimers).toBe(1);
    }
    worker.deliverQueuedReply();
    expect((await outcome).kind).toBe('success');
    expect(worker.backendCommitted).toBe(true);
    expect(clock.pendingTimers).toBe(0);
    clock.advanceWithoutTasks(1000);
    expect(clock.runDue()).toBe(0);
    expect(worker.terminated).toBe(false);
    expect(warning).not.toHaveBeenCalled();
  });

  it.each([
    ['commit', 'indexeddb', 'indexeddb', PAYLOAD.byteLength],
    ['read', 'opfs', 'opfs', null],
    ['probe', 'auto', null, null],
  ] as const)(
    'an on-time %s timeout reports its request without a grace period',
    async (requestOperation, preference, selectedBackend, inputBytes) => {
      const { clock, worker, outcome, request, warning } = await beginRequest(requestOperation, preference);
      clock.advanceWithoutTasks(DEADLINE);
      expect(clock.runDue()).toBe(1);
      expect(worker.terminated).toBe(true);
      expect(clock.pendingTimers).toBe(0);
      const error = await timeoutError(outcome);
      expect(error.cause).toEqual({
        requestId: request.id,
        operation: requestOperation,
        backend: selectedBackend,
        elapsedRealMs: clock.nowRealMs,
        timerOvershootRealMs: 0,
        inputBytes,
        stallGraceApplied: false,
      });
      expect(error.message).toContain(JSON.stringify(error.cause));
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledWith(error);
    },
  );

  it('a silent worker gets only one stall grace even when the grace callback is also late', async () => {
    const { clock, worker, outcome, warning } = await beginRequest();
    clock.advanceWithoutTasks(1000);
    const initialOvershootRealMs = clock.nowRealMs - DEADLINE;
    expect(clock.runDue()).toBe(1);
    expect(worker.terminated).toBe(false);
    expect(warning).not.toHaveBeenCalled();
    expect(clock.pendingTimers).toBe(1);
    const untilGrace = clock.nextDue - clock.nowRealMs;
    expect(untilGrace).toBeGreaterThan(0);
    clock.advanceWithoutTasks(untilGrace + 1000);
    expect(clock.runDue()).toBe(1);
    expect(worker.terminated).toBe(true);
    expect(clock.pendingTimers).toBe(0);
    const error = await timeoutError(outcome);
    expect(error.cause).toMatchObject({
      elapsedRealMs: clock.nowRealMs,
      timerOvershootRealMs: initialOvershootRealMs,
      stallGraceApplied: true,
    });
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
