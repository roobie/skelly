import { NoToneMapping, type ToneMapping } from 'three';
import { describe, expect, it } from 'vitest';
import { SHADOW_DISTANCES } from '../src/core/mood.ts';
import { DEFAULT_FOGGINESS, type Weather } from '../src/core/weather.ts';
import { actionsByGroup, DEBUG_GROUPS, paramName } from '../src/debug/groups.ts';
import { type Action, createDebugActions, dispatchDebugAction } from '../src/debug/index.ts';
import { LookControls } from '../src/debug/look.ts';
import { LOOK_PARAMS } from '../src/debug/lookUrl.ts';
import type { DebugHooks } from '../src/game/debugInterface.ts';
import { inputBindings } from '../src/game/inputBindings.ts';
import { TONE_MODES } from '../src/render/look.ts';
import { FakeMood } from './fakeMood.ts';
import { FakeShadows } from './fakeShadows.ts';

interface FakeRenderer {
  toneMapping: ToneMapping;
  toneMappingExposure: number;
}
describe('debug action dispatch', () => {
  it('places each exposed debug action in one group and binds it semantically', () => {
    const { actions } = makeActions();
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      const binding = inputBindings.binding(action.id);
      expect(binding?.debug).toBe(true);
      expect(binding?.gate).toBeDefined();
      expect(action.key).toBe(inputBindings.label(action.id));
    }
    const grouped = actionsByGroup(actions).flatMap(({ actions: inGroup }) => inGroup);
    expect(grouped).toHaveLength(actions.length);
    expect(new Set(grouped.map(({ id }) => id)).size).toBe(actions.length);
  });
  it('routes replay registry actions to the existing export and import controls', () => {
    const { actions, replayCalls } = makeActions();
    expect(dispatchDebugAction(actions, 'debug.input-replay-export')).toBe(true);
    expect(dispatchDebugAction(actions, 'debug.input-replay-import')).toBe(true);
    expect(replayCalls).toEqual(['export', 'import']);
  });
  it('dispatches each exposed toggle to its owner rather than retaining panel-only state', () => {
    const { actions } = makeActions();
    const toggles = actions.filter((action) => action.state !== undefined);
    expect(toggles.length).toBeGreaterThan(0);
    for (const action of toggles) {
      const before = action.state!();
      expect(dispatchDebugAction(actions, action.id)).toBe(true);
      expect(action.state!()).toBe(!before);
      dispatchDebugAction(actions, action.id);
      expect(action.state!()).toBe(before);
    }
  });
  it('dispatches the tone and sun-shadow cycles through their derived values and wraps', () => {
    const { actions, look } = makeActions();
    const toneStart = TONE_MODES.findIndex(({ key }) => key === look.toneKey);
    const tones = TONE_MODES.map((_, index) => TONE_MODES[(toneStart + index + 1) % TONE_MODES.length]!.key);
    for (const tone of tones) {
      expect(dispatchDebugAction(actions, 'debug.tone-cycle')).toBe(true);
      expect(look.toneKey).toBe(tone);
    }

    const shadowStart = SHADOW_DISTANCES.indexOf(look.shadowState.distance);
    expect(shadowStart).toBeGreaterThanOrEqual(0);
    const distances = SHADOW_DISTANCES.map(
      (_, index) => SHADOW_DISTANCES[(shadowStart + index + 1) % SHADOW_DISTANCES.length],
    );
    for (const distance of distances) {
      expect(dispatchDebugAction(actions, 'debug.shadow-distance-cycle')).toBe(true);
      expect(look.shadowState.distance).toBe(distance);
    }
  });
  it('steps look controls in opposite directions without pinning tuning or default values', () => {
    const { actions, look } = makeActions();
    const pairs = [
      ['debug.exposure-increase', 'debug.exposure-decrease', () => look.exposure],
      ['debug.grade-decrease', 'debug.grade-increase', () => -look.moodState.grade],
      ['debug.torch-increase', 'debug.torch-decrease', () => look.torch],
      ['debug.fog-increase', 'debug.fog-decrease', () => look.fogginess],
      ['debug.bloom-clip-increase', 'debug.bloom-clip-decrease', () => look.bloomClip],
    ] as const;
    for (const [increase, decrease, value] of pairs) {
      const before = value();
      expect(dispatchDebugAction(actions, increase)).toBe(true);
      const raised = value();
      expect(raised).toBeGreaterThan(before);
      dispatchDebugAction(actions, increase, true);
      expect(value()).toBe(raised);
      dispatchDebugAction(actions, decrease);
      expect(value()).toBeLessThan(raised);
    }
  });
  it('forwards time-skip and spawn requests once and refuses unknown commands', () => {
    const { actions, skips, spawnCounts } = makeActions(25);
    for (const action of ['debug.skip-hour', 'debug.skip-long']) {
      expect(dispatchDebugAction(actions, action)).toBe(true);
      const count = skips.length;
      expect(skips.at(-1)).toBeGreaterThan(0);
      dispatchDebugAction(actions, action, true);
      expect(skips).toHaveLength(count);
    }
    dispatchDebugAction(actions, 'debug.spawn-shamblers');
    dispatchDebugAction(actions, 'debug.spawn-shamblers', true);
    expect(spawnCounts).toEqual([25]);
    expect(dispatchDebugAction(actions, 'fixture.unknown')).toBe(false);
  });
  it('catalogues the same URL parameters that the look owner accepts', () => {
    const { actions } = makeActions();
    const catalogued = new Set([
      ...actions.flatMap((action) => (action.param ? [paramName(action.param)] : [])),
      ...DEBUG_GROUPS.flatMap((def) =>
        (def.notes ?? []).flatMap((note) => (note.param ? [paramName(note.param)] : [])),
      ),
    ]);
    expect([...catalogued].sort()).toEqual([...LOOK_PARAMS, 'cam'].sort());
  });
});

const makeActions = (
  shamblerCount = 1,
): { actions: Action[]; spawnCounts: number[]; skips: number[]; look: LookControls; replayCalls: string[] } => {
  const renderer: FakeRenderer = { toneMapping: NoToneMapping, toneMappingExposure: 1 };
  const skips: number[] = [];
  let linear = false;
  let patterns = true;
  let occlusion = true;
  const mood = new FakeMood();
  const weather: Weather = { fogginess: DEFAULT_FOGGINESS };
  const shadows = new FakeShadows();
  const flashlight = { strength: 1 };
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
    { weather, shadows, flashlight },
  );
  const sim = {
    godMode: false,
    calendar: 19.5 * 3600,
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
  let laserEnabled = true;
  const spawnCounts: number[] = [];
  const replayCalls: string[] = [];
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
    toggleAim: () => {
      aimEnabled = !aimEnabled;
    },
    isFrozen: () => frozen,
    toggleFrozen: () => {
      frozen = !frozen;
    },
    isGameFrozen: () => gameFrozen,
    toggleGameFrozen: () => {
      gameFrozen = !gameFrozen;
    },
    exportInputReplay: () => {
      replayCalls.push('export');
    },
    chooseInputReplay: () => {
      replayCalls.push('import');
    },
    impactLaser: {
      enabled: () => laserEnabled,
      toggle: () => {
        laserEnabled = !laserEnabled;
      },
    },
  });
  return { actions, spawnCounts, skips, look, replayCalls };
};
