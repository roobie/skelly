import { AgXToneMapping, NoToneMapping, type ToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FOGGINESS, type Weather } from '../src/core/weather.ts';
import { type Action, createDebugActions, dispatchDebugAction } from '../src/debug/index.ts';
import { LookControls } from '../src/debug/look.ts';
import type { DebugHooks } from '../src/game/debugInterface.ts';
import { FakeMood } from './fakeMood.ts';
import { FakeShadows } from './fakeShadows.ts';

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
      ['M', 'Freeze game'],
      ['J', 'Tone mapping'],
      ['-', 'Exposure −'],
      ['=', 'Exposure +'],
      ['I', 'sRGB block colours'],
      [';', 'Surface patterns'],
      ['9', 'Wide ambient occlusion'],
      ['Q', 'Mood post-processing (all)'],
      ["'", 'Bloom'],
      ['\\', 'Film (vignette, grain)'],
      ['0', 'Sun shadows'],
      ['Home', 'Flashlight shadows'],
      ['PgUp', 'Sun shadow distance'],
      ['End', 'Crack check (magenta background)'],
      ['PgDn', 'Hot-pixel check (coloured)'],
      ['L', 'Fogginess −'],
      ['/', 'Fogginess +'],
      ['[', 'Grade −'],
      [']', 'Grade +'],
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

  it('toggles the wide ambient occlusion on Digit9, on by default', () => {
    const { actions } = makeActions();
    const action = actions.find((candidate) => candidate.code === 'Digit9')!;
    expect(action.state?.()).toBe(true);
    dispatchDebugAction(actions, 'Digit9');
    expect(action.state?.()).toBe(false);
  });

  it('toggles the mood effects and steps the grade, which clamps to 0..1', () => {
    const { actions, mood } = makeActions();
    const byCode = (code: string) => actions.find((candidate) => candidate.code === code)!;
    for (const code of ['KeyQ', 'Quote', 'Backslash']) {
      expect(byCode(code).state?.()).toBe(true);
      dispatchDebugAction(actions, code);
      expect(byCode(code).state?.()).toBe(false);
    }
    expect([mood.post, mood.bloom, mood.film]).toEqual([false, false, false]);
    expect(byCode('BracketLeft').detail?.()).toBe('1.0');
    dispatchDebugAction(actions, 'BracketLeft');
    dispatchDebugAction(actions, 'BracketLeft');
    expect(byCode('BracketRight').detail?.()).toBe('0.8');
    for (let i = 0; i < 20; i++) {
      dispatchDebugAction(actions, 'BracketLeft');
    }
    expect(mood.grade).toBe(0);
    for (let i = 0; i < 20; i++) {
      dispatchDebugAction(actions, 'BracketRight');
    }
    expect(mood.grade).toBe(1);
  });

  it('toggles the sun and flashlight shadows and steps the sun shadow distance through 24, 40, 64', () => {
    const { actions, shadows } = makeActions();
    const byCode = (code: string) => actions.find((candidate) => candidate.code === code)!;
    expect([byCode('Digit0').state?.(), byCode('Home').state?.()]).toEqual([true, true]);
    dispatchDebugAction(actions, 'Digit0');
    expect([shadows.settings.sun, shadows.settings.torch]).toEqual([false, true]);
    dispatchDebugAction(actions, 'Home');
    expect([byCode('Digit0').state?.(), byCode('Home').state?.()]).toEqual([false, false]);
    expect(byCode('PageUp').detail?.()).toBe('40 m');
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      dispatchDebugAction(actions, 'PageUp');
      seen.push(shadows.settings.distance);
    }
    expect(seen).toEqual([64, 24, 40, 64]);
    dispatchDebugAction(actions, 'PageUp', true);
    expect(shadows.settings.distance).toBe(64);
  });

  it('steps the weather fogginess by tenths, which clamps to 0..1', () => {
    const { actions, weather } = makeActions();
    const byCode = (code: string) => actions.find((candidate) => candidate.code === code)!;
    expect(byCode('Slash').detail?.()).toBe('0.2');
    dispatchDebugAction(actions, 'Slash');
    expect(byCode('KeyL').detail?.()).toBe('0.3');
    for (let i = 0; i < 20; i++) {
      dispatchDebugAction(actions, 'Slash');
    }
    expect(weather.fogginess).toBe(1);
    for (let i = 0; i < 20; i++) {
      dispatchDebugAction(actions, 'KeyL');
    }
    expect(weather.fogginess).toBe(0);
  });

  it.each(['KeyB', 'KeyG', 'KeyH', 'KeyP', 'KeyT', 'KeyU', 'KeyY', 'KeyO', 'KeyM'])(
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
    expect(dispatchDebugAction(actions, 'F12')).toBe(false);
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
  mood: FakeMood;
  weather: Weather;
  shadows: FakeShadows;
} => {
  const renderer: FakeRenderer = { toneMapping: NoToneMapping, toneMappingExposure: 1 };
  const clock = { calendar: 19.5 * 3600 };
  const skips: number[] = [];
  let linear = false;
  let patterns = true;
  let occlusion = true;
  const mood = new FakeMood();
  const weather: Weather = { fogginess: DEFAULT_FOGGINESS };
  const shadows = new FakeShadows();
  const look = new LookControls(
    renderer,
    {
      get linearColorsOn() {
        return linear;
      },
      setLinearColors(on: boolean) {
        linear = on;
      },
      get patternsOn() {
        return patterns;
      },
      setPatterns(on: boolean) {
        patterns = on;
      },
      get occlusionOn() {
        return occlusion;
      },
      setOcclusion(on: boolean) {
        occlusion = on;
      },
    },
    mood,
    { weather, shadows },
  );
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
  let gameFrozen = false;
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
    isGameFrozen: () => gameFrozen,
    toggleGameFrozen() {
      gameFrozen = !gameFrozen;
    },
  });
  return { actions, spawnCounts, skips, renderer, clock, mood, weather, shadows };
};
