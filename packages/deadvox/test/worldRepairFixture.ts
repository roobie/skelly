import { Character } from '../src/core/character.ts';
import type { Registry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { Simulation } from '../src/core/sim.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { fixtureSources } from './economyFixtures.ts';

export const STOCK = 'world_repair_stock';
export const PIECE = 'world_repair_piece';
export const OTHER_PIECE = 'world_repair_other_piece';
export const RECIPE = 'world_repair_recipe';
export const DURABILITY = 100;
export const AMOUNT = 20;
export const worldRepairSources = () =>
  fixtureSources([
    {
      source: 'world-repair-fixture',
      data: {
        skills: [{ id: 'world_repair_skill', name: 'Fixture repair', startingRecipes: [RECIPE] }],
        items: [{ id: STOCK, name: 'Fixture stock', category: 'material', size: [1, 1], weight: 1 }],
        furniture: [PIECE, OTHER_PIECE].map((id) => ({
          id,
          name: 'Fixture piece',
          size: [1, 1, 1],
          color: '#777777',
          breach: { minimumStrength: 1, durability: DURABILITY },
        })),
        recipes: [
          {
            id: RECIPE,
            kind: 'repair',
            result: { item: STOCK, count: 1 },
            repair: { entity: PIECE, skill: 'world_repair_skill', amount: AMOUNT, perSkill: 0 },
            timeGameMinutes: 1,
            skills: {},
            qualities: {},
            components: [[{ item: STOCK, count: 2 }]],
          },
        ],
      },
    },
  ]);

export const worldRepairFixture = (registry: Registry) => {
  const character = new Character(registry);
  const inventory = new Inventory(registry, undefined, undefined, character);
  const sim = new Simulation({
    seed: 1,
    registry,
    clock: BASE_CLOCK,
    bodyTuning: registry.body.get(CORE_CONTENT_IDS.player)!,
    compressionCaps: registry.compression.get(CORE_CONTENT_IDS.player)!.caps,
  });
  const position: [number, number, number] = [0, 0, 0];
  const reach = bindReach({ inventory, position, blockSize: 0.5, clock: BASE_CLOCK });
  const commands = new CraftCommands({ inventory, character, sim, queue: new HandlingQueue(inventory), reach });
  const target = inventory.entities.add({ type: PIECE, pos: [1, 1, 0], size: [1, 1, 1], facing: 'n' })!;
  if (inventory.entities.bash(target, DURABILITY / 2) !== 'damaged') {
    throw new Error('Fixture piece was not damaged');
  }
  if (!inventory.add(inventory.create(STOCK, 2), { kind: 'pile', pos: [0, 0, 0] })) {
    throw new Error('Fixture stock did not fit');
  }
  return { registry, inventory, character, commands, target, position };
};
