import { describe, expect, it, vi } from 'vitest';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { startupContent } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';

const BUNDLED_CONTENT = startupContent();

import { Survival } from '../src/game/survival.ts';
import { Tutorial, type TutorialObservation, tutorialRequested, tutorialUrl } from '../src/game/tutorial.ts';
import { Simulation } from './simulationFixture.ts';

const observation = (): TutorialObservation => ({
  position: [0, 1, 0],
  yaw: 0,
  crouching: false,
  doorOpen: false,
  searched: false,
  looted: false,
  wielded: false,
  lightOn: false,
  litType: undefined,
  paused: false,
});
const lightKit = BUNDLED_CONTENT.registry.layouts.get('tutorial')!.practice!.light;
const fixture = () => {
  const tutorial = new Tutorial([0, 1, 0], 0, { x0: 10, z0: 10, x1: 12, z1: 12 }, lightKit);
  const state = observation();
  const observe = () => tutorial.observe(state);
  return { tutorial, state, observe };
};

describe('practice objectives', () => {
  it('advances only on completed outcomes and offers the optional modules after the final pause', () => {
    const { tutorial, state, observe } = fixture();
    observe();
    expect(tutorial.stage).toBe('move');
    state.position = [7, 1, 0];
    observe();
    expect(tutorial.stage).toBe('move');
    state.yaw = 1;
    observe();
    expect(tutorial.stage).toBe('door');
    state.doorOpen = true;
    observe();
    expect(tutorial.stage).toBe('loot');
    state.searched = true;
    observe();
    expect(tutorial.stage).toBe('loot');
    state.looted = true;
    observe();
    expect(tutorial.stage).toBe('hands');
    state.wielded = true;
    observe();
    expect(tutorial.stage).toBe('open');
    tutorial.consumed('unrelated_fixture_food');
    expect(tutorial.stage).toBe('open');
    tutorial.opened('canned_beans');
    expect(tutorial.stage).toBe('eat');
    tutorial.consumed('beans');
    expect(tutorial.stage).toBe('drink');
    tutorial.consumed('water_bottle');
    expect(tutorial.stage).toBe('light');
    observe();
    expect(tutorial.stage).toBe('light');
    state.lightOn = true;
    observe();
    expect(tutorial.stage).toBe('light');
    state.lightOn = false;
    observe();
    expect(tutorial.stage).toBe('escape');
    state.position = [11, 1, 11];
    observe();
    expect(tutorial.stage).toBe('escape');
    state.crouching = true;
    observe();
    expect(tutorial.stage).toBe('pause');
    expect(tutorial.canStartLight).toBe(false);
    state.paused = true;
    observe();
    expect(tutorial.stage).toBe('finish');
    expect(tutorial.canStartLight).toBe(true);
    expect(new URL(tutorialUrl('https://example.org/deadvox/?tutorial=1', false)).search).toBe('');
  });

  it('completes the light module on a lit light, a finished battery swap and the light on again', () => {
    const { tutorial, state, observe } = fixture();
    const inventory = new Inventory(BUNDLED_CONTENT.registry);
    const queue = new HandlingQueue(inventory);
    const survival = new Survival(new Simulation({ seed: 1 }), inventory, queue, {
      reach: bindReach({ inventory, position: state.position, blockSize: 1, clock: BASE_CLOCK }),
      feet: () => ({ kind: 'pile', pos: state.position }),
      notice: vi.fn(),
      read: vi.fn(),
      batterySwapped: (type) => tutorial.batterySwapped(type),
    });
    const light = inventory.create(lightKit.light);
    expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
    const swap = () => {
      if (!inventory.hands.right) {
        expect(inventory.add(inventory.create(lightKit.battery), { kind: 'hand', side: 'right' })).toBe(true);
      }
      expect(survival.use(inventory.hands.right!)).toBeUndefined();
    };
    tutorial.opened('canned_beans');
    tutorial.consumed('beans');
    tutorial.consumed('water_bottle');
    Object.assign(state, { position: [7, 1, 0], yaw: 1, doorOpen: true, searched: true, looted: true, wielded: true });
    state.lightOn = true;
    observe();
    Object.assign(state, { lightOn: false, position: [11, 1, 11], crouching: true });
    observe();
    state.paused = true;
    observe();
    // Outcomes before the module starts earn nothing.
    state.litType = lightKit.light;
    observe();
    swap();
    queue.tick(queue.remaining);
    expect(tutorial.stage).toBe('finish');
    tutorial.startLight();
    expect(tutorial.canStartLight).toBe(false);
    state.litType = undefined;
    observe();
    expect(tutorial.stage).toBe('light-on');
    state.litType = lightKit.light;
    observe();
    expect(tutorial.stage).toBe('light-swap');
    state.litType = undefined;
    swap();
    queue.cancel();
    observe();
    expect(tutorial.stage).toBe('light-swap');
    swap();
    expect(queue.tick(queue.remaining).failed).toEqual([]);
    observe();
    expect(tutorial.stage).toBe('light-relight');
    state.litType = lightKit.light;
    observe();
    expect(tutorial.stage).toBe('finish');
  });

  it('remembers out-of-order supplies instead of requiring already consumed items again', () => {
    const { tutorial, state, observe } = fixture();
    tutorial.opened('canned_beans');
    const inventory = new Inventory(BUNDLED_CONTENT.registry);
    const queue = new HandlingQueue(inventory);
    const survival = new Survival(new Simulation({ seed: 1 }), inventory, queue, {
      reach: bindReach({ inventory, position: state.position, blockSize: 1, clock: BASE_CLOCK }),
      feet: () => ({ kind: 'pile', pos: state.position }),
      notice: vi.fn(),
      read: vi.fn(),
      consumed: (type) => tutorial.consumed(type),
    });
    const jeans = inventory.create('jeans');
    expect(inventory.add(jeans, { kind: 'worn' })).toBe(true);
    for (const type of ['beans', 'beans']) {
      const item = inventory.create(type);
      expect(inventory.add(item, { kind: 'pocket', owner: jeans, pocket: 0 })).toBe(true);
      expect(survival.useFromQuickbar(item)).toBeUndefined();
      state.wielded = Object.values(inventory.hands).some((held) => held?.type === 'beans');
      observe();
      expect(tutorial.stage).toBe('move');
      queue.tick(queue.remaining);
      expect(inventory.itemByUid(item.uid)).toBeUndefined();
    }
    expect(Object.values(inventory.hands).every((item) => item === undefined)).toBe(true);
    const water = inventory.create('water_bottle');
    expect(inventory.add(water, { kind: 'hand', side: 'right' })).toBe(true);
    expect(survival.useFromQuickbar(water)).toBeUndefined();
    queue.tick(queue.remaining);
    state.lightOn = true;
    observe();
    state.lightOn = false;
    observe();
    state.position = [7, 1, 0];
    state.yaw = 1;
    state.doorOpen = true;
    state.searched = true;
    state.looted = true;
    observe();
    expect(tutorial.stage).toBe('escape');
  });

  it('returns practice to its selected site and beginner mode', () => {
    for (const [site, mode] of [
      ['playtest', null],
      ['gauntlet', 'beginner'],
    ]) {
      const returned = new URL(
        tutorialUrl(`https://example.org/deadvox/?site=${site}&tutorial=1${mode ? `&mods=${mode}` : ''}`, false),
      );
      expect(returned.searchParams.get('site')).toBe(site);
      expect(returned.searchParams.get('mods')).toBe(mode);
      expect(returned.searchParams.has('tutorial')).toBe(false);
    }
  });

  it('also isolates direct authored-site links and clears continuation and debug parameters on exit', () => {
    expect(tutorialRequested(new URLSearchParams('site=tutorial'))).toBe(true);
    expect(tutorialRequested(new URLSearchParams('tutorial=1'))).toBe(true);
    expect(tutorialRequested(new URLSearchParams('site=hamlet'))).toBe(false);
    const start = new URL(
      tutorialUrl('https://example.org/deadvox/?tutorial=1&debug=1&save-backend=indexeddb#continue', false),
    );
    expect(start.pathname).toBe('/deadvox/');
    expect(start.searchParams.get('save-backend')).toBe('indexeddb');
    expect([...start.searchParams.keys()]).toEqual(['save-backend']);
    expect(start.hash).toBe('');
  });
});
