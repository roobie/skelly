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
  paused: false,
});
const fixture = () => {
  const complete = vi.fn();
  const tutorial = new Tutorial([0, 1, 0], 0, { x0: 10, z0: 10, x1: 12, z1: 12 }, complete);
  const state = observation();
  const observe = () => tutorial.observe(state);
  return { tutorial, state, complete, observe };
};

describe('practice objectives', () => {
  it('advances only on completed outcomes and returns to start after the final pause', () => {
    const { tutorial, state, complete, observe } = fixture();
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
    expect(tutorial.stage).toBe('eat');
    tutorial.consumed('unrelated_fixture_food');
    expect(tutorial.stage).toBe('eat');
    tutorial.consumed('canned_beans');
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
    expect(complete).not.toHaveBeenCalled();
    state.paused = true;
    observe();
    observe();
    expect(complete).toHaveBeenCalledOnce();
    expect(new URL(tutorialUrl('https://example.org/deadvox/?tutorial=1', false)).search).toBe('');
  });

  it('remembers out-of-order supplies instead of requiring already consumed items again', () => {
    const { tutorial, state, observe } = fixture();
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
    for (const type of ['canned_beans', 'canned_beans']) {
      const item = inventory.create(type);
      expect(inventory.add(item, { kind: 'pocket', owner: jeans, pocket: 0 })).toBe(true);
      expect(survival.useFromQuickbar(item)).toBeUndefined();
      state.wielded = Object.values(inventory.hands).some((held) => held?.type === 'canned_beans');
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
