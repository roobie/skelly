import { describe, expect, it } from 'vitest';
import { type Action, createDebugActions, dispatchDebugAction } from '../src/debug/index.ts';
import type { DebugHooks } from '../src/game/debugInterface.ts';

describe('debug action table', () => {
  it('keeps every action and shortcut in the one panel table', () => {
    const { actions } = makeActions();
    expect(actions.map(({ key, label }) => [key, label])).toEqual([
      ['B', 'Build tools'],
      ['G', 'Spawn item menu'],
      ['H', 'God mode'],
      ['P', 'Noclip'],
      ['T', 'Compress / rest'],
      ['N', 'Emit noise'],
      ['U', 'Danger test'],
      ['K', 'Take 25 damage'],
      ['V', 'Spawn shambler'],
    ]);
  });

  it.each(['KeyB', 'KeyG', 'KeyH', 'KeyP', 'KeyT', 'KeyU'])(
    '%s updates its displayed toggle state on keydown',
    (code) => {
      const { actions } = makeActions();
      const action = actions.find((candidate) => candidate.code === code)!;
      expect(action.state?.()).toBe(false);
      expect(dispatchDebugAction(actions, code)).toBe(true);
      expect(action.state?.()).toBe(true);
      expect(dispatchDebugAction(actions, code)).toBe(true);
      expect(action.state?.()).toBe(false);
    },
  );

  it('consumes repeated action keys without repeating their action', () => {
    const { actions } = makeActions();
    const godMode = actions.find((candidate) => candidate.code === 'KeyH')!;
    expect(dispatchDebugAction(actions, 'KeyH', true)).toBe(true);
    expect(godMode.state?.()).toBe(false);
    expect(dispatchDebugAction(actions, 'KeyQ')).toBe(false);
  });
});

const makeActions = (): { actions: Action[] } => {
  const sim = {
    godMode: false,
    compression: {
      active: false,
      stop() {
        this.active = false;
      },
    },
    emit() {
      throw new Error('not exercised');
    },
    hurt() {
      throw new Error('not exercised');
    },
  };
  const hooks = {
    sim,
    compress() {
      sim.compression.active = true;
    },
  } as unknown as DebugHooks;
  const build = {
    on: false,
    toggle() {
      this.on = !this.on;
    },
  };
  const spawnMenu = { isOpen: false };
  let noclip = false;
  let danger = false;
  const actions = createDebugActions({
    hooks,
    build,
    spawnMenu,
    toggleSpawn() {
      spawnMenu.isOpen = !spawnMenu.isOpen;
    },
    isNoclip: () => noclip,
    toggleNoclip: () => {
      noclip = !noclip;
    },
    isDanger: () => danger,
    toggleDanger: () => {
      danger = !danger;
    },
    spawnShambler() {
      throw new Error('not exercised');
    },
  });
  return { actions };
};
