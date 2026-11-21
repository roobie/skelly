import { buildRegistry } from '@skelly/engine/content';
import { worldCellRepair } from '@skelly/engine/internal/core/blockDamage.ts';
import { drawCondition } from '@skelly/engine/internal/core/conditionDistribution.ts';
import { Rng } from '@skelly/engine/internal/core/random.ts';
import { SimulationTerrain } from '@skelly/engine/internal/core/simulationTerrain.ts';
import { templateDamageSource } from '@skelly/engine/internal/core/templateDamage.ts';
import { compileTemplate } from '@skelly/engine/internal/core/templates.ts';
import { terrainPlacements } from '@skelly/engine/internal/core/terrainPlan.ts';
import { createTerrainEvaluator, makeScale, type TerrainPlan, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { blockMaterialFixture } from './blockMaterialFixture.ts';

const origin: Vec3 = [3, 2, 3];
const fixture = (mean = 0.2, spread = 0.1, plainOverlay = false) => {
  const { registry, issues } = buildRegistry([
    {
      source: 'condition-fixture.json',
      data: {
        ...blockMaterialFixture('condition_wall'),
        blocks: [
          {
            id: 'condition_wall',
            name: 'Fixture wall',
            material: 'fixture_material',
            color: '#888888',
            solid: true,
            drops: { default: 'fixture_blow' },
          },
        ],
        templates: [
          {
            id: 'condition_fixture',
            lootContext: { usage: ['Residential'], tier: 'Tier1' },
            size: [2, 1, 2],
            palette: { '#': 'condition_wall' },
            layers: [['##', '##']],
            condition: { mean, spread, paneThreshold: 0.5 },
          },
        ],
      },
    },
  ]);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  const template = compileTemplate(registry, registry.templates.get('condition_fixture')!);
  const wall = registry.blockIds.get('condition_wall')!;
  const scale = makeScale(0.5);
  const plan: TerrainPlan = {
    seed: 17,
    scale,
    structures: [],
    blocks: { grass: wall, dirt: wall, rock: wall, sand: wall, water: wall },
    shape: {
      minHeightMetres: 0,
      maxHeightMetres: 0,
      beachBelowMetres: 0,
      dirtDepthMetres: 1,
      featureSizeMetres: 1,
      octaves: 1,
    },
    site: {
      kind: 'natural',
      stamps: [
        { kind: 'placements', placements: terrainPlacements([{ template, origin, turn: 1 }]) },
        ...(plainOverlay
          ? [
              {
                kind: 'boxes' as const,
                boxes: [{ min: origin, max: origin.map((value) => value + 1) as Vec3, block: wall }],
              },
            ]
          : []),
      ],
    },
  };
  const make = () => {
    const world = new SimulationTerrain(createTerrainEvaluator(plan));
    world.blockDamage.bindGenerated(templateDamageSource(world.canonical, registry, world));
    return world;
  };
  return { world: make(), make, registry, wall };
};

describe('template condition', () => {
  it('regenerates untouched defaults by identity without adding saved cells or columns', () => {
    const { world, make, registry } = fixture();
    world.arrive(0, 0);
    const defaults = [...world.blockDamage.damaged()];
    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults.every(([, entry]) => entry.damage > 0)).toBe(true);
    expect(world.blockDamage.snapshotState().entries).toEqual([]);
    expect(world.snapshotColumns((id) => registry.blocks[id]!.id)).toEqual([]);
    const restored = make();
    restored.arrive(1, 0);
    restored.arrive(0, 0);
    expect([...restored.blockDamage.damaged()]).toEqual(defaults);
    world.unload(0, 0);
    expect([...world.blockDamage.damaged()]).toEqual([]);
    world.arrive(0, 0);
    expect([...world.blockDamage.damaged()]).toEqual(defaults);
  });

  it('repairs generated damage through worldCellRepair and preserves a completed repair across reload and replacement', () => {
    const { world, make, registry, wall } = fixture();
    world.arrive(0, 0);
    const repair = worldCellRepair(world, registry);
    const before = repair.state(origin)!;
    expect(before.damage).toBeGreaterThan(0);
    expect(repair.refusal(origin, before.epoch, before.block, { amount: before.damage, ceiling: 1 })).toBeUndefined();
    expect(repair.repair(origin, before.epoch, before.damage / 2, 1)).toBe(true);
    expect(repair.state(origin)!.damage).toBeLessThan(before.damage);
    const restore = () => {
      const restored = make();
      restored.restoreColumns(
        structuredClone(world.snapshotColumns((id) => registry.blocks[id]!.id)),
        (id) => registry.blockIds.get(id)!,
      );
      expect(restored.blockDamage.restoreState(structuredClone(world.blockDamage.snapshotState()), registry)).toEqual(
        [],
      );
      restored.arrive(0, 0);
      return restored;
    };
    expect(restore().blockDamage.get(origin)).toEqual(world.blockDamage.get(origin));
    expect(repair.repair(origin, before.epoch, before.damage, 1)).toBe(true);
    expect(restore().blockDamage.get(origin)).toBeUndefined();
    expect(world.blockDamage.snapshotState().entries.every((entry) => entry.cell.join(',') === origin.join(','))).toBe(
      true,
    );
    world.setBlock(...origin, 0);
    const replaced = restore();
    replaced.setBlock(...origin, wall);
    expect(replaced.blockDamage.get(origin)).toBeUndefined();
    expect(worldCellRepair(replaced, registry).repair(origin, before.epoch, before.damage, 1)).toBe(false);
  });

  it('does not inherit condition through a later unconditioned stamp of the same block', () => {
    const { world, registry, wall } = fixture(0.2, 0.1, true);
    world.arrive(0, 0);
    expect([...world.blockDamage.damaged()].length).toBeGreaterThan(0);
    expect(world.getBlock(...origin)).toBe(wall);
    expect(worldCellRepair(world, registry).state(origin)).toBeUndefined();
  });

  it('keeps a zero-condition block standing and repairable rather than making a hole', () => {
    const { world, registry, wall } = fixture(0, 0.5);
    world.arrive(0, 0);
    expect(world.getBlock(...origin)).toBe(wall);
    const repair = worldCellRepair(world, registry);
    const at = repair.state(origin)!;
    expect(at.damage).toBe(at.durability);
    expect(repair.repair(origin, at.epoch, at.durability / 2, 1)).toBe(true);
    expect(world.getBlock(...origin)).toBe(wall);
    expect(repair.state(origin)!.damage).toBeLessThan(at.damage);
  });
});

it('draws bounded beta conditions with the authored expected mean and increasing variance', () => {
  const sample = (mean: number, spread: number) => {
    const rng = Rng.stream(19, 'distribution-property');
    const values = Array.from({ length: 4096 }, () => drawCondition(mean, spread, rng));
    expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(Math.abs(average - mean)).toBeLessThan(0.025);
    return values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  };
  for (const mean of [0.05, 0.5, 0.95]) {
    expect(sample(mean, 0.05)).toBeLessThan(sample(mean, 0.5));
    expect(drawCondition(mean, 0, Rng.stream(19, 'constant'))).toBe(mean);
  }
  for (const mean of [0, 1]) {
    expect(drawCondition(mean, 1, Rng.stream(19, 'endpoint'))).toBe(mean);
  }
});
