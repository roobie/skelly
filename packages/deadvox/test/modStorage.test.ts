import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { ModStorage } from '../src/game/modStorage.ts';

const mods = [
  { source: 'mod-2/second.json', text: JSON.stringify({ id: 'second', version: '2' }), enabled: false },
  { source: 'mod-1/first.json', text: JSON.stringify({ id: 'first' }), enabled: true },
];
afterEach(() => vi.restoreAllMocks());

test('IndexedDB reload preserves the complete ordered selection including disabled identities', async () => {
  const factory = new IDBFactory();
  const storage = new ModStorage(factory);
  expect(await storage.load()).toEqual([]);
  await storage.save(mods);
  const reloaded = await new ModStorage(factory).load();
  expect(reloaded).toEqual(mods);
  expect(reloaded).not.toBe(mods);
});

test('an aborted replacement leaves the previous entire selection intact', async () => {
  const factory = new IDBFactory();
  const storage = new ModStorage(factory);
  await storage.save(mods);
  const original = IDBObjectStore.prototype.put;
  const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = original.apply(this, args);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  });
  await expect(storage.save(mods.slice(1))).rejects.toThrow();
  fault.mockRestore();
  expect(await new ModStorage(factory).load()).toEqual(mods);
});

test('discarding removes the stored selection so the next load is empty', async () => {
  const storage = new ModStorage(new IDBFactory());
  await storage.save(mods);
  await storage.discard();
  expect(await storage.load()).toEqual([]);
});

test('malformed selections are refused whole rather than retaining valid rows', async () => {
  const storage = new ModStorage(new IDBFactory());
  await expect(storage.save([...mods, { source: 'bad', text: 3, enabled: true }] as never)).rejects.toThrow();
  expect(await storage.load()).toEqual([]);
});
