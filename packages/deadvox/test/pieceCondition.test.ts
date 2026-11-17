import type { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import { BlockEntities, cellCondition, type Vec3, World } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

// Every piece and block reads a condition, so the crosshair can always show its band (`../INTERFACE.md`, "Condition").
const registry = baseRegistry();

it('gives every placeable a condition from its durability, whole when placed intact and lower once worn', () => {
  const defs = [...registry.furniture.values()];
  expect(defs.length).toBeGreaterThan(0);
  const entities = new BlockEntities(registry);
  for (const [index, def] of defs.entries()) {
    const entity = entities.add({ type: def.id, pos: [index * 16, 1, 0], size: def.size, facing: 'n' });
    expect(entity, def.id).toBeDefined();
    expect(entities.conditionOf(entity!), def.id).toBe(1);
    entities.wear(entity!, 0.5);
    expect(entities.conditionOf(entity!), def.id).toBeCloseTo(0.5);
  }
});

it('gives every solid block a condition from its material, whole when undamaged and lower once struck', () => {
  const solid = registry.blocks.filter((block) => block.solid);
  expect(solid.length).toBeGreaterThan(0);
  const world = new World();
  const cell: Vec3 = [1, 1, 0];
  for (const block of solid) {
    world.setBlock(...cell, registry.blockIds.get(block.id)!);
    expect(cellCondition(world, registry, cell), block.id).toEqual({ name: block.name, condition: 1 });
  }
  const struck = solid.find((block) => registry.blockMaterials.get(block.material)!.breakable)!;
  const { durability } = registry.blockMaterials.get(struck.material)!;
  world.setBlock(...cell, registry.blockIds.get(struck.id)!);
  // Damage records run through the world owner's own terrain view, as strikes do.
  const terrain = { world, getBlock: world.getBlock.bind(world), ensureCell: () => undefined };
  world.blockDamage.record(terrain as unknown as CanonicalTerrain, registry, cell, durability / 2);
  expect(cellCondition(world, registry, cell)?.condition).toBeCloseTo(0.5);
});
