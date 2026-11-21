import { authoringIssues, buildRegistry } from '@skelly/engine/content';
import { worldCellRepair } from '@skelly/engine/internal/core/blockDamage.ts';
import { BlockEntities } from '@skelly/engine/internal/core/blockEntities.ts';
import { conditionAt, templateCondition } from '@skelly/engine/internal/core/conditionDistribution.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { SimulationTerrain } from '@skelly/engine/internal/core/simulationTerrain.ts';
import { furnitureOf } from '@skelly/engine/internal/core/site.ts';
import { templateDamageSource } from '@skelly/engine/internal/core/templateDamage.ts';
import { cellsOf, compileAssembly, placedCell, type Turn } from '@skelly/engine/internal/core/templates.ts';
import { terrainPlacements } from '@skelly/engine/internal/core/terrainPlan.ts';
import { createTerrainEvaluator, makeScale, type TerrainPlan, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { baseContentSources } from './baseContentFiles.ts';

const content = JSON.parse(
  compileJsonnetFile(
    'packages/deadvox/mods/skelly.deadvox.scenario.buildings.assembly-condition-look/buildings.jsonnet',
  ),
) as ContentFile;
const sources = baseContentSources();
const makeRegistry = (data = content) => {
  const result = buildRegistry([...sources, { source: 'assembly-condition-fixture.json', data }]);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.registry;
};
const registry = makeRegistry();
const compile = (id: string, owner = registry) =>
  compileAssembly(owner, owner.mapAssemblies.get(id)!, { seed: 17, siteId: 'condition-fixture' });

const makeWorld = (template: ReturnType<typeof compile>, turn: Turn) => {
  const stone = registry.blockIds.get('brick')!;
  const placement = { template, origin: [14, 2, 14] as Vec3, turn };
  const plan: TerrainPlan = {
    seed: 17,
    scale: makeScale(0.5),
    structures: [],
    blocks: { grass: stone, dirt: stone, rock: stone, sand: stone, water: stone },
    shape: {
      minHeightMetres: 0,
      maxHeightMetres: 0,
      beachBelowMetres: 0,
      dirtDepthMetres: 1,
      featureSizeMetres: 1,
      octaves: 1,
    },
    site: { kind: 'natural', stamps: [{ kind: 'placements', placements: terrainPlacements([placement]) }] },
  };
  const make = () => {
    const world = new SimulationTerrain(createTerrainEvaluator(plan));
    world.blockDamage.bindGenerated(templateDamageSource(world.canonical, registry, world));
    return world;
  };
  return { make, placement };
};

const arrive = (world: SimulationTerrain, reverse = false) => {
  const columns = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const;
  for (const [x, z] of reverse ? [...columns].reverse() : columns) {
    world.arrive(x, z);
  }
};

describe('assembly condition', () => {
  it('keeps a zero-condition answer fit-valid without changing its geometry', () => {
    expect(authoringIssues(registry)).toEqual([]);
    const intact = compile('condition_pavilion_intact');
    const worn = compile('condition_pavilion_nested');
    expect(worn.blocks).toEqual(intact.blocks);
    expect(worn.ownership).toEqual(intact.ownership);
    expect(worn.pieces).toEqual(intact.pieces);
  });

  it('uses the nearest declaring assembly policy unless the piece declares its own', () => {
    const nested = compile('condition_pavilion_nested');
    const root = registry.mapAssemblies.get(nested.id)!.condition!;
    const inner = registry.mapAssemblies.get('condition_pavilion_window_owner')!.condition!;
    const window = registry.mapPieces.get('condition_pavilion_window')!;
    expect(nested.provenance!.some((entry) => entry?.variant === window.id)).toBe(true);
    expect(nested.provenance!.some((entry) => entry?.variant !== window.id)).toBe(true);
    for (const entry of nested.provenance!) {
      if (entry) {
        expect(entry.condition).toEqual(entry.variant === window.id ? inner : root);
      }
    }
    const data = structuredClone(content);
    const leaf = data.mapPieces!.find(({ id }) => id === window.id)!;
    leaf.condition = { mean: 0.3, spread: 0, paneThreshold: 0.1 };
    const changed = compile(nested.id, makeRegistry(data));
    const frames = changed.provenance!.filter((entry) => entry?.variant === window.id);
    expect(frames.length).toBeGreaterThan(0);
    for (const entry of frames) {
      expect(entry!.condition).toEqual(leaf.condition);
    }
  });

  it('does not leak a nested assembly policy through the shared leaf cache', () => {
    const nested = compile('condition_pavilion_nested');
    const combined = {
      ...registry.mapAssemblies.get(nested.id)!,
      id: 'condition_cache_fixture',
      brief: undefined,
      access: undefined,
      condition: undefined,
      size: [16, 7, 7] as Vec3,
      anchors: {},
      slots: [
        {
          id: 'plain',
          at: [0, 0, 0] as Vec3,
          size: nested.size,
          turn: 0 as const,
          choices: [{ ref: { kind: 'piece' as const, id: 'condition_pavilion_shell' }, weight: 1 }],
        },
        {
          id: 'worn',
          at: [8, 0, 0] as Vec3,
          size: nested.size,
          turn: 0 as const,
          choices: [{ ref: { kind: 'assembly' as const, id: 'condition_pavilion_worn' }, weight: 1 }],
        },
      ],
    };
    const shared = compileAssembly(registry, combined, { seed: 17, siteId: 'cache-fixture' });
    for (const slot of combined.slots) {
      expect(shared.provenance!.some((entry) => entry?.owner.includes(`/${slot.id}`))).toBe(true);
    }
    for (const entry of shared.provenance!) {
      if (entry) {
        const expected = entry.owner.endsWith('/plain')
          ? undefined
          : registry.mapAssemblies.get('condition_pavilion_worn')!.condition;
        expect(entry.condition).toEqual(expected);
      }
    }
  });

  it('rotates nested condition provenance with the cells delegated to a turned slot', () => {
    const nested = compile('condition_pavilion_nested');
    expect(nested.provenance!.some((entry) => entry?.condition)).toBe(true);
    for (const turn of [1, 2, 3] as const) {
      const size: Vec3 = turn % 2 === 0 ? nested.size : [nested.size[2], nested.size[1], nested.size[0]];
      const wrapper = compileAssembly(
        registry,
        {
          id: 'turned_condition_fixture',
          lootContext: nested.lootContext,
          size,
          joins: [],
          anchors: {},
          ports: [],
          slots: [
            {
              id: 'turned',
              at: [0, 0, 0],
              size,
              turn,
              choices: [{ ref: { kind: 'assembly', id: nested.id }, weight: 1 }],
            },
          ],
        },
        { seed: 17, siteId: 'rotation-fixture' },
      );
      for (const local of cellsOf(nested.size)) {
        const at = placedCell({ size: nested.size, origin: [0, 0, 0], turn }, local);
        expect(conditionAt(wrapper, at)).toEqual(conditionAt(nested, local));
      }
    }
  });

  it('regenerates bounded baseline damage independent of visits and rotation, saving only player repairs', () => {
    const template = compile('condition_pavilion_worn');
    for (const turn of [0, 1, 2, 3] as const) {
      const { make, placement } = makeWorld(template, turn);
      const world = make();
      arrive(world);
      const damaged = [...world.blockDamage.damaged()];
      expect(damaged.length).toBeGreaterThan(0);
      expect(world.blockDamage.snapshotState().entries).toEqual([]);
      expect(world.snapshotColumns((id) => registry.blocks[id]!.id)).toEqual([]);
      const reverse = make();
      arrive(reverse, true);
      expect([...reverse.blockDamage.damaged()]).toEqual(damaged);
      const local = [...cellsOf(template.size)].find((cell) => {
        const index = cell[0] + template.size[0] * (cell[2] + template.size[2] * cell[1]);
        return registry.blocks[template.blocks[index]!]!.solid;
      })!;
      const target = placedCell({ size: template.size, ...placement }, local);
      const repair = worldCellRepair(world, registry);
      for (const [at, value] of damaged) {
        const state = repair.state(at)!;
        expect(value.damage).toBeGreaterThanOrEqual(0);
        expect(value.damage).toBeLessThanOrEqual(state.durability);
      }
      const before = repair.state(target)!;
      expect(before.damage / before.durability).toBeCloseTo(1 - templateCondition(17, placement, local));
      expect(repair.repair(target, before.epoch, before.damage, 1)).toBe(true);
      const restored = make();
      restored.restoreColumns(
        structuredClone(world.snapshotColumns((id) => registry.blocks[id]!.id)),
        (id) => registry.blockIds.get(id)!,
      );
      expect(restored.blockDamage.restoreState(structuredClone(world.blockDamage.snapshotState()), registry)).toEqual(
        [],
      );
      arrive(restored, true);
      expect(restored.blockDamage.get(target)).toBeUndefined();
      expect(
        restored.blockDamage.snapshotState().entries.every((entry) => entry.cell.join(',') === target.join(',')),
      ).toBe(true);
      expect([...restored.blockDamage.damaged()].length).toBeGreaterThan(0);
    }
  });

  it('gives rotated panes and frames their spatial owner policy and retains the window save owner', () => {
    for (const id of ['condition_pavilion_worn', 'condition_pavilion_nested']) {
      const template = compile(id);
      const local = template.pieces[0]!.pos;
      const policy = conditionAt(template, local)!;
      expect(policy).toBeDefined();
      for (const turn of [0, 1, 2, 3] as const) {
        const placement = { template, origin: [3, 2, 3] as Vec3, turn };
        const spawns = furnitureOf({ seed: 17, registry }, placement, [0, 0], []);
        expect(spawns.length).toBeGreaterThan(0);
        const entities = new BlockEntities(registry);
        for (const spawn of spawns) {
          const frame = entities.add(spawn.spec)!;
          const value = templateCondition(17, placement, local);
          expect(spawn.spec.initialCondition).toEqual({ value, paneThreshold: policy.paneThreshold });
          expect(entities.conditionOf(frame)).toBeCloseTo(value);
          expect(frame.window!.pane).toBe(value < policy.paneThreshold ? 'missing' : 'intact');
          const restored = BlockEntities.restoreState(registry, structuredClone(entities.snapshotState())).byUid(
            frame.uid,
          )!;
          expect(restored.window).toEqual(frame.window);
          expect(restored.damage).toBe(frame.damage);
        }
      }
    }
  });
});
