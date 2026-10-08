import { describe, expect, it } from 'vitest';
import { createDurableWriteTransaction } from '../src/game/indexedDbCommit.ts';

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
});
