// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import { ModStorage } from '../src/game/modStorage.ts';
import { chooseMods } from '../src/ui/modsPanel.ts';
import { baseScreenText } from './baseRegistry.ts';

vi.mock('../src/game/browserMods.ts', () => ({
  MAX_MOD_BYTES: 100,
  evaluateMods: (mods: { source: string; enabled: boolean }[]) => ({
    content: {},
    issues: new Map(),
    canStart: true,
    admitted: mods.filter(({ enabled }) => enabled).map(({ source }) => ({ id: source })),
  }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test('unavailable storage names the failure and starts with an empty mod set', async () => {
  const storage = new ModStorage();
  vi.spyOn(storage, 'load').mockRejectedValue(new Error('blocked'));
  const root = document.createElement('div');
  document.body.append(root);
  const result = chooseMods(root, baseScreenText().mods, storage);
  await Promise.resolve();
  const alert = root.querySelector('[role=alert]');
  expect(alert).not.toBeNull();
  expect(alert!.textContent).not.toBe('');
  expect(root.querySelectorAll('[data-mod-source]')).toHaveLength(0);
  root.querySelector<HTMLButtonElement>('#mods-start')!.click();
  expect((await result).admitted).toEqual([]);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const storeRaw = async (factory: IDBFactory, value: unknown) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('deadvox.browser-mods', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('selection');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('selection', 'readwrite');
    transaction.objectStore('selection').put(value, 'active');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

test('an invalid stored selection is refused with a discard control, and adding a mod works after discarding it', async () => {
  const factory = new IDBFactory();
  await storeRaw(factory, [{ source: 'bad', text: 3, enabled: true }]);
  const storage = new ModStorage(factory);
  const root = document.createElement('div');
  document.body.append(root);
  const result = chooseMods(root, baseScreenText().mods, storage);
  await vi.waitFor(() => expect(root.querySelector('#mods-discard')).not.toBeNull());
  expect(root.querySelector('[role=alert]')!.textContent).not.toBe('');
  expect(root.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(true);
  root.querySelector<HTMLButtonElement>('#mods-discard')!.click();
  await vi.waitFor(() => expect(root.querySelector('#mods-discard')).toBeNull());
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(textarea.disabled).toBe(false);
  textarea.value = '{"id":"fresh"}';
  textarea.dispatchEvent(new Event('input'));
  root.querySelector<HTMLButtonElement>('#mods-add')!.click();
  await vi.waitFor(() => expect(root.querySelectorAll('[data-mod-source]')).toHaveLength(1));
  await vi.waitFor(async () => expect(await new ModStorage(factory).load()).toHaveLength(1));
  root.querySelector<HTMLButtonElement>('#mods-start')!.click();
  expect((await result).admitted).toHaveLength(1);
});

test('a storage that is unavailable offers no discard', async () => {
  const storage = new ModStorage();
  vi.spyOn(storage, 'load').mockRejectedValue(new Error('blocked'));
  const root = document.createElement('div');
  document.body.append(root);
  chooseMods(root, baseScreenText().mods, storage);
  await vi.waitFor(() => expect(root.querySelector('[role=alert]')!.textContent).not.toBe(''));
  expect(root.querySelector('#mods-discard')).toBeNull();
});

test('a failed save keeps the mods already stored and drops only the change that did not save', async () => {
  const storage = new ModStorage();
  vi.spyOn(storage, 'load').mockResolvedValue([{ source: 'first', text: '{"id":"first"}', enabled: true }]);
  vi.spyOn(storage, 'save').mockRejectedValue(new Error('quota'));
  const root = document.createElement('div');
  document.body.append(root);
  const result = chooseMods(root, baseScreenText().mods, storage);
  await settle();
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
  textarea.value = '{"id":"second"}';
  textarea.dispatchEvent(new Event('input'));
  root.querySelector<HTMLButtonElement>('#mods-add')!.click();
  await vi.waitFor(() => expect(root.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(false));
  const sources = [...root.querySelectorAll('[data-mod-source]')].map((row) => row.getAttribute('data-mod-source'));
  expect(sources).toEqual(['first']);
  expect(root.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(false);
  expect([...root.querySelectorAll('[role=alert]')].some((alert) => alert.textContent !== '')).toBe(true);
  root.querySelector<HTMLButtonElement>('#mods-start')!.click();
  expect((await result).admitted).toEqual([{ id: 'first' }]);
});
