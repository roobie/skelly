// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { installSearchInputKeyboardBoundary } from '../src/debug/searchInputKeyboard.ts';
import { Input } from '../src/game/input.ts';

it('preserves both walking states while typing Z, then restores normal toggling after dismissal', () => {
  const gameTarget = document.createElement('canvas');
  const search = document.createElement('input');
  document.body.append(gameTarget, search);
  const input = new Input(gameTarget);
  let menuOpen = true;
  const removeBoundary = installSearchInputKeyboardBoundary((target) => menuOpen && target === search);
  const codesAtSearch: string[] = [];
  search.addEventListener('keydown', (event) => codesAtSearch.push((event as KeyboardEvent).code));

  const keyEvent = (type: 'keydown' | 'keyup') =>
    new KeyboardEvent(type, { bubbles: true, cancelable: true, code: 'KeyZ', key: 'z' });

  try {
    for (const walking of [false, true]) {
      input.walking = walking;
      const searchDown = keyEvent('keydown');
      search.dispatchEvent(searchDown);
      expect(input.walking).toBe(walking);
      expect(codesAtSearch.at(-1)).toBe('');
      expect(searchDown.code).toBe('KeyZ');
      expect(searchDown.defaultPrevented).toBe(false);
      search.dispatchEvent(keyEvent('keyup'));
      expect(input.held.size).toBe(0);

      menuOpen = false;
      search.dispatchEvent(keyEvent('keydown'));
      expect(input.walking).toBe(!walking);
      search.dispatchEvent(keyEvent('keyup'));
      expect(input.held.size).toBe(0);
      menuOpen = true;
    }
  } finally {
    removeBoundary();
    gameTarget.remove();
    search.remove();
  }
});
