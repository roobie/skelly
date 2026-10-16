// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { ModStorage } from '../src/game/modStorage.ts';
import { chooseMods } from '../src/ui/modsPanel.ts';

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
  const result = chooseMods(root, storage);
  await vi.waitFor(() => expect(root.querySelector('[role=alert]')?.textContent).toContain('Mod storage unavailable'));
  expect(root.querySelectorAll('[data-mod-source]')).toHaveLength(0);
  root.querySelector<HTMLButtonElement>('#mods-start')!.click();
  expect((await result).admitted).toEqual([]);
});

test('a failed edit clears the entire loaded set rather than starting with a subset', async () => {
  const storage = new ModStorage();
  vi.spyOn(storage, 'load').mockResolvedValue([
    { source: 'first', text: '{"id":"first"}', enabled: true },
    { source: 'second', text: '{"id":"second"}', enabled: true },
  ]);
  let fail!: (error: Error) => void;
  vi.spyOn(storage, 'save').mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  const root = document.createElement('div');
  document.body.append(root);
  const result = chooseMods(root, storage);
  await vi.waitFor(() => expect(root.querySelectorAll('[data-mod-source]')).toHaveLength(2));
  root.querySelector<HTMLButtonElement>('li button:last-of-type')!.click();
  expect(root.querySelector<HTMLButtonElement>('#mods-start')!.disabled).toBe(true);
  fail(new Error('quota'));
  await vi.waitFor(() => expect(root.querySelector('[role=alert]')?.textContent).toContain('Mod storage unavailable'));
  expect(root.querySelectorAll('[data-mod-source]')).toHaveLength(0);
  root.querySelector<HTMLButtonElement>('#mods-start')!.click();
  expect((await result).admitted).toEqual([]);
});
