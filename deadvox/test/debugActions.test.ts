import { AgXToneMapping, NoToneMapping, type ToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import { type Action, createDebugActions, dispatchDebugAction } from '../src/debug/index.ts';
import { LookControls } from '../src/debug/look.ts';
import type { DebugHooks } from '../src/game/debugInterface.ts';

interface FakeRenderer {
  toneMapping: ToneMapping;
  toneMappingExposure: number;
}

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
      ['J', 'Tone mapping'],
      ['-', 'Exposure −'],
      ['=', 'Exposure +'],
      ['I', 'sRGB block colours'],
      [',', 'Skip +23 h (−1 h tomorrow)'],
      ['.', 'Skip +1 h'],
    ]);
  });

  it('skips the real game clock forward by 1 and 23 hours, showing the game time', () => {
    const { actions, skips, clock } = makeActions();
    const byCode = (code: string) => actions.find((candidate) => candidate.code === code)!;
    expect(byCode('Period').detail?.()).toBe('Day 1, 19:30');
    dispatchDebugAction(actions, 'Period');
    dispatchDebugAction(actions, 'Comma');
    expect(skips).toEqual([1, 23]);
    clock.calendar += 23 * 3600;
    expect(byCode('Comma').detail?.()).toBe('Day 2, 18:30');
    dispatchDebugAction(actions, 'Period', true);
    expect(skips).toEqual([1, 23]);
  });

  it('cycles tone mapping, clamps exposure and toggles linear colours, with details for the panel', () => {
    const { actions, renderer } = makeActions();
    const byCode = (code: string) => actions.find((candidate) => candidate.code === code)!;
    expect(byCode('KeyJ').detail?.()).toBe('None');
    for (const name of ['AgX', 'ACES Filmic', 'Neutral', 'None']) {
      dispatchDebugAction(actions, 'KeyJ');
      expect(byCode('KeyJ').detail?.()).toBe(name);
    }
    dispatchDebugAction(actions, 'KeyJ');
    expect(renderer.toneMapping).toBe(AgXToneMapping);

    dispatchDebugAction(actions, 'Equal');
    dispatchDebugAction(actions, 'Equal');
    expect(byCode('Equal').detail?.()).toBe('1.2');
    for (let i = 0; i < 40; i++) {
      dispatchDebugAction(actions, 'Equal');
    }
    expect(renderer.toneMappingExposure).toBe(3);
    for (let i = 0; i < 60; i++) {
      dispatchDebugAction(actions, 'Minus');
    }
    expect(renderer.toneMappingExposure).toBe(0.2);

    expect(byCode('KeyI').state?.()).toBe(false);
    dispatchDebugAction(actions, 'KeyI');
    expect(byCode('KeyI').state?.()).toBe(true);
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

const makeActions = (
  shamblerCount = 1,
): {
  actions: Action[];
  spawnCounts: number[];
  skips: number[];
  renderer: FakeRenderer;
  clock: { calendar: number };
} => {
  const renderer: FakeRenderer = { toneMapping: NoToneMapping, toneMappingExposure: 1 };
  const clock = { calendar: 19.5 * 3600 };
  const skips: number[] = [];
  let linear = false;
  const look = new LookControls(renderer, {
    get linearColorsOn() {
      return linear;
    },
    setLinearColors(on: boolean) {
      linear = on;
    },
  });
  const sim = {
    godMode: false,
    get calendar() {
      return clock.calendar;
    },
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
    skipGameHours(hours: number) {
      skips.push(hours);
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
    look,
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
  return { actions, spawnCounts, skips, renderer, clock };
};
