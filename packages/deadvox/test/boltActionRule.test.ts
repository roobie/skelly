import type { FirearmAction } from '@skelly/engine/inventory';
import { isBoltAction } from '@skelly/engine/inventory';
import type { Motion } from '@skelly/motion/motion';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

const actionWith = (motion: Motion): FirearmAction =>
  ({ parts: { handle: { node: 'handle:handle', motion } } }) as unknown as FirearmAction;

const slide = { kind: 'slide', direction: [0, 0, 1], travel: 0.05 } as const;
const hinge = { kind: 'hinge', axis: [1, 0, 0], pivot: [0, 0, 0], degrees: 45 } as const;

it('reads a hinged charging handle without an unlocked stop as no bolt', () => {
  const notched = actionWith({
    stages: [slide, hinge],
    stops: [
      { name: 'rest', clock: 0 },
      { name: 'open', clock: 0.8 },
      { name: 'notched', clock: 1 },
    ],
  } as unknown as Motion);
  expect(isBoltAction(notched)).toBe(false);
});

it('reads a part with an unlocked stop as a bolt', () => {
  const bolt = actionWith({
    stages: [hinge, slide],
    stops: [
      { name: 'rest', clock: 0 },
      { name: 'unlocked', clock: 0.3 },
      { name: 'open', clock: 1 },
    ],
  } as unknown as Motion);
  expect(isBoltAction(bolt)).toBe(true);
});

it('finds the shipped bolt rifle a bolt and no other gun', () => {
  const registry = baseRegistry();
  const bolts = [...registry.items.values()]
    .filter((item) => item.firearm && item.model)
    .filter((item) => {
      const action = registry.models.get(item.model!)?.gun?.action;
      return action !== undefined && isBoltAction(action);
    })
    .map((item) => Boolean(item.firearm?.bolt));
  expect(bolts.length).toBeGreaterThan(0);
  expect(bolts.every(Boolean)).toBe(true);
});
