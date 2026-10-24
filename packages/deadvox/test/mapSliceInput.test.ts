import { describe, expect, it } from 'vitest';
import { BindingRegistry, INPUT_BINDINGS, KeyboardInput } from '../src/game/inputBindings.ts';
import { MAP_SLICE_ACTIONS, type MapSliceAction, mapSliceKeys } from '../src/game/mapSliceInput.ts';

const keyEvent = (code: string, extra: Partial<Record<'shiftKey' | 'ctrlKey', boolean>> = {}) => ({
  code,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  timeStamp: 0,
  ...extra,
});

const mapKeys = () => {
  const registry = new BindingRegistry(INPUT_BINDINGS, undefined);
  registry.setDebugRun();
  const ran: MapSliceAction[] = [];
  const keys = mapSliceKeys(new KeyboardInput(registry), (action) => ran.push(action));
  return { registry, keys, ran };
};

describe('review map slice keys', () => {
  it('takes a slice action bound to a modifier key itself', () => {
    const { registry, keys, ran } = mapKeys();
    const [lower] = MAP_SLICE_ACTIONS;
    expect(registry.rebind(lower, [{ code: 'ShiftLeft' }], true)).toBeUndefined();

    expect(keys.down(keyEvent('ShiftLeft', { shiftKey: true }))).toBe(true);
    expect(ran).toEqual([lower]);
  });

  it('refuses a browser-owned modifier on a slice key as the game does', () => {
    const { registry, keys, ran } = mapKeys();
    const [lower] = MAP_SLICE_ACTIONS;
    const [chord] = registry.chords(lower);

    expect(keys.down(keyEvent(chord!.code, { ctrlKey: true }))).toBe(false);
    expect(ran).toEqual([]);
  });

  it('works again after the debug gate was released while another window had focus', () => {
    const { registry, keys, ran } = mapKeys();
    const [gate] = registry.chords('debug.gate');
    const [chord] = registry.chords(MAP_SLICE_ACTIONS[0]);

    keys.down(keyEvent(gate!.code));
    expect(keys.down(keyEvent(chord!.code))).toBe(false);
    keys.up(keyEvent(chord!.code));
    keys.blurred();

    expect(keys.down(keyEvent(chord!.code))).toBe(true);
    expect(ran).toEqual([MAP_SLICE_ACTIONS[0]]);
  });

  it('keeps the matching release from the game once it took the press', () => {
    const { registry, keys } = mapKeys();
    const [chord] = registry.chords(MAP_SLICE_ACTIONS[0]);

    expect(keys.down(keyEvent(chord!.code))).toBe(true);
    expect(keys.up(keyEvent(chord!.code))).toBe(true);
    expect(keys.up(keyEvent(chord!.code))).toBe(false);
  });
});
