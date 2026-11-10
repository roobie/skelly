import type { GuidanceDef, GuidanceGate } from '@skelly/engine/content';
import { Inventory } from '@skelly/engine/inventory';
import { expect, it } from 'vitest';
import { type GuidanceObservation, GuidedSteps } from '../../presentation/src/presentation/guidedSteps.ts';
import { selectedGuidanceHint } from '../../presentation/src/ui/guidedSteps.ts';
import { baseRegistry } from './baseRegistry.ts';

const gate = (all: string[] = []) => ({ all, none: [] });
const step = (id: string, complete: GuidanceGate, enabled = gate()): GuidanceDef['steps'][number] => ({
  id,
  enabled,
  complete,
  topics: [],
  hints: [{ when: {}, parts: [] }],
  notes: [],
});
const observation = (): GuidanceObservation => ({
  position: [0, 0, 0],
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
const fixture = () => {
  const definition: GuidanceDef = {
    observe: {},
    handling: [],
    rules: [
      { id: 'travelled', when: { kind: 'displacement', blocks: 3 }, enabled: gate(), at: [] },
      { id: 'turned', when: { kind: 'turn', radians: 0.5 }, enabled: gate(), at: [] },
      { id: 'ate', when: { kind: 'consumed', item: 'fixture_food' }, enabled: gate(), at: [] },
      { id: 'changed', when: { kind: 'battery-swapped', item: 'fixture_lamp' }, enabled: gate(['extra']), at: [] },
    ],
    steps: [
      step('supplies', gate(['ate'])),
      step('walk', gate(['travelled', 'turned'])),
      step('swap', gate(['changed']), gate(['extra'])),
      step('done', { ...gate(), any: [] }),
    ],
    choices: [{ id: 'extra', at: ['done'], once: true, action: 'choose', label: 'Extra' }],
    chrome: {
      inventory: 'Inventory',
      closeInventory: 'Close',
      wieldSelectedItem: 'Wield',
      unsaved: 'Unsaved',
      controls: 'Controls',
      restart: 'Restart',
      exit: 'Exit',
    },
  };
  const guide = new GuidedSteps([0, 0, 0], 0, { x0: 10, x1: 11, z0: 10, z1: 11 }, definition);
  return { guide, definition };
};

it('uses authored order, thresholds and item references rather than built-in stages', () => {
  const { guide } = fixture();
  const state = observation();
  guide.consumed('other_food');
  expect(guide.stage).toBe('supplies');
  guide.consumed('fixture_food');
  expect(guide.stage).toBe('walk');
  guide.observe({ ...state, position: [2, 0, 0], yaw: 0.6 });
  expect(guide.stage).toBe('walk');
  guide.observe({ ...state, position: [3, 0, 0] });
  expect(guide.stage).toBe('done');
});

it('selects authored hint cases in order using the live inventory context', () => {
  const { guide, definition } = fixture();
  const inventory = new Inventory(baseRegistry());
  const hints = [
    { when: { inventoryOpen: true }, parts: [{ action: 'inventory.hands', label: 'Fixture action' }] },
    { when: {}, parts: [{ text: 'Fixture closed hint' }] },
  ];
  definition.steps[0]!.hints = hints;
  const state = { inventory, inventoryOpen: false, lightOn: false };
  expect(selectedGuidanceHint(guide, state)).toBe(hints[1]!.parts);
  expect(selectedGuidanceHint(guide, { ...state, inventoryOpen: true })).toBe(hints[0]!.parts);
});

it('does not credit optional outcomes before the authored choice is available and selected', () => {
  const { guide } = fixture();
  guide.choose('extra');
  guide.batterySwapped('fixture_lamp');
  guide.consumed('fixture_food');
  guide.observe({ ...observation(), position: [3, 0, 0], yaw: 1 });
  expect(guide.stage).toBe('done');
  guide.choose('extra');
  expect(guide.stage).toBe('swap');
  guide.batterySwapped('another_lamp');
  expect(guide.stage).toBe('swap');
  guide.batterySwapped('fixture_lamp');
  expect(guide.stage).toBe('done');
  expect(guide.canChoose('extra')).toBe(false);
});
