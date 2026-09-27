import { describe, expect, it } from 'vitest';
import { isMenuOpeningKey, nextMenuCursor, worldActionForKey } from '../src/game/input.ts';

describe('menu input', () => {
  it('identifies G as the opening key so its text default can be cancelled', () => {
    expect(isMenuOpeningKey('KeyG', true, false)).toBe(true);
    expect(isMenuOpeningKey('KeyG', true, true)).toBe(false);
    expect(isMenuOpeningKey('KeyG', false, false)).toBe(false);
    expect(isMenuOpeningKey('KeyF10', true, false)).toBe(false);
  });

  it('binds world interaction to F and leaves Q and E unbound', () => {
    expect(worldActionForKey('KeyF')).toBe('interact');
    expect(worldActionForKey('KeyQ')).toBeUndefined();
    expect(worldActionForKey('KeyE')).toBeUndefined();
  });

  it('moves the menu cursor and clamps it to the viewport', () => {
    expect(nextMenuCursor({ x: 20, y: 30 }, { x: 5, y: -8 }, { width: 100, height: 80 })).toEqual({ x: 25, y: 22 });
    expect(nextMenuCursor({ x: 99, y: 79 }, { x: 10, y: 10 }, { width: 100, height: 80 })).toEqual({ x: 99, y: 79 });
    expect(nextMenuCursor({ x: 0, y: 0 }, { x: -10, y: -10 }, { width: 100, height: 80 })).toEqual({ x: 0, y: 0 });
  });
});
