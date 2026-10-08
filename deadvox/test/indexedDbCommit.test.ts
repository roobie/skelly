import { describe, expect, it } from 'vitest';
import { createDurableWriteTransaction, transactionDone } from '../src/game/indexedDbCommit.ts';

describe('IndexedDB save commits', () => {
  it('requests strict durability for save writes', () => {
    const calls: unknown[][] = [];
    const database = {
      transaction: (...args: unknown[]) => {
        calls.push(args);
        return {};
      },
    } as unknown as IDBDatabase;

    createDurableWriteTransaction(database, 'slots');

    expect(calls).toEqual([['slots', 'readwrite', { durability: 'strict' }]]);
  });

  it('does not resolve a commit wait until the transaction completes', async () => {
    const transaction = {
      error: null,
      oncomplete: null,
      onabort: null,
      onerror: null,
    } as unknown as IDBTransaction;
    let resolved = false;
    const committed = transactionDone(transaction).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    transaction.oncomplete?.(new Event('complete'));
    await expect(committed).resolves.toBeUndefined();
    expect(resolved).toBe(true);
  });
});
