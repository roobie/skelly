import type { Actor } from '@skelly/engine/internal/core/actorState.ts';
import type { ReachPlayer } from '@skelly/engine/internal/core/reach.ts';
import { downedBodyPlan } from '@skelly/engine/internal/game/downedBody.ts';
import { Inventory } from '@skelly/engine/inventory';
import { expect, it } from 'vitest';
import { baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { fixtureSources } from './economyFixtures.ts';

it('dismembers with the carried tool of the lowest id, whatever the names say', () => {
  const tool = (id: string, name: string) => ({
    id,
    name,
    category: 'tool',
    weight: 1,
    size: [1, 1],
    tool: { qualities: { cutting: 1 } },
  });
  const registry = baseRegistryWith(
    fixtureSources([
      {
        source: 'dismember-tools.json',
        data: { items: [tool('dismember_tool_a', 'Zed saw'), tool('dismember_tool_b', 'Alpha saw')] },
      },
    ]),
  );
  const inventory = new Inventory(registry);
  expect(inventory.add(inventory.create('dismember_tool_b'), { kind: 'hand', side: 'left' })).toBe(true);
  expect(inventory.add(inventory.create('dismember_tool_a'), { kind: 'hand', side: 'right' })).toBe(true);
  const actor = {
    incapacitated: true,
    type: {
      name: 'Fixture',
      downed: {
        finishOff: { simSeconds: 1 },
        dismember: { quality: 'cutting', level: 1, simSeconds: 1 },
      },
    },
    body: { pos: [0.5, 0, 1.5], halfWidth: 0.4, height: 0.5 },
  } as Actor;
  const player: ReachPlayer = { inventory, position: [0.5, 0, 0.5], blockSize: 0.5, clock: BASE_CLOCK };
  const plan = downedBodyPlan(player, actor, 'dismember');
  expect(plan.ok && plan.tool?.type).toBe('dismember_tool_a');
});
