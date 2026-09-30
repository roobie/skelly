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
      ['V', 'Spawn shamblers'],
      ['Y', 'Melee aim boxes'],
      ['O', 'Freeze shamblers'],
    ]);
  });

  it.each(['KeyB', 'KeyG', 'KeyH', 'KeyP', 'KeyT', 'KeyU', 'KeyY', 'KeyO'])(
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

  it('V spawns the selected count and does not repeat on key repeat', () => {
    const { actions, spawnCounts } = makeActions(25);
    expect(dispatchDebugAction(actions, 'KeyV')).toBe(true);
    expect(spawnCounts).toEqual([25]);
    expect(dispatchDebugAction(actions, 'KeyV', true)).toBe(true);
    expect(spawnCounts).toEqual([25]);
  });

  it('consumes repeated action keys without repeating their action', () => {
    const { actions } = makeActions();
    const godMode = actions.find((candidate) => candidate.code === 'KeyH')!;
    expect(dispatchDebugAction(actions, 'KeyH', true)).toBe(true);
    expect(godMode.state?.()).toBe(false);
    expect(dispatchDebugAction(actions, 'KeyQ')).toBe(false);
  });
});

const makeActions = (shamblerCount = 1): { actions: Action[]; spawnCounts: number[] } => {
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
  let aimEnabled = false;
  let frozen = false;
  const spawnCounts: number[] = [];
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
    shamblerCount: () => shamblerCount,
    spawnShambler(count) {
      spawnCounts.push(count);
    },
    isAimEnabled: () => aimEnabled,
    toggleAim() {
      aimEnabled = !aimEnabled;
    },
    isFrozen: () => frozen,
    toggleFrozen() {
      frozen = !frozen;
    },
  });
  return { actions, spawnCounts };
};
