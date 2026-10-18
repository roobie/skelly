// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { bundledModIdsFromUrl, selectBundledMods } from '../src/game/bundledMods.ts';
import { mountModOptions } from '../src/ui/modOptions.ts';

const startedWith = (href: string) => {
  const params = new URL(href).searchParams;
  return { params, ids: selectBundledMods(bundledModIdsFromUrl(params)).admitted.map(({ id }) => id) };
};

const toggle = (root: HTMLElement, id: string): void => {
  const box = root.querySelector<HTMLInputElement>(`[data-bundled-mod="${id}"] input`)!;
  box.checked = !box.checked;
  box.dispatchEvent(new Event('change'));
};

describe('launcher mod list', () => {
  let root: HTMLElement;
  let navigated: string[];
  beforeEach(() => {
    history.replaceState(null, '', '/?seed=3');
    root = document.createElement('div');
    navigated = [];
  });

  it('starts the next world with a checked mod and keeps the other parameters', () => {
    mountModOptions(root, [], (href) => navigated.push(href));
    toggle(root, 'beginner');
    const next = startedWith(navigated[0]!);
    expect(next.ids).toEqual(['beginner']);
    expect(next.params.get('seed')).toBe('3');
  });

  it('starts the next world without a running mod once it is unchecked', () => {
    history.replaceState(null, '', '/?seed=3&mods=beginner');
    mountModOptions(root, ['beginner'], (href) => navigated.push(href));
    expect(root.querySelector<HTMLInputElement>('[data-bundled-mod="beginner"] input')!.checked).toBe(true);
    toggle(root, 'beginner');
    const next = startedWith(navigated[0]!);
    expect(next.ids).toEqual([]);
    expect(next.params.get('seed')).toBe('3');
  });
});
