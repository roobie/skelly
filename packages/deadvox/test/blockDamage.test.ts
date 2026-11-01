import { describe, expect, it } from 'vitest';
import { bashBlock } from '../src/core/blockDamage.ts';
import { BLOCK_DAMAGE_KINDS } from '../src/core/blockDamageKinds.ts';
import { CanonicalTerrain } from '../src/core/canonicalTerrain.ts';
import { Chunk } from '../src/core/chunk.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import type { Terrain } from '../src/core/worldgen.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { blockMaterialFixture, fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const cell: Vec3 = [2, 3, 2];
const stampCell: Vec3 = [4, 5, 4];
const structureCell: Vec3 = [6, 5, 6];
const fixtureData = () => ({
  ...blockMaterialFixture('fixture_rubble'),
  blocks: [
    { id: 'fixture_wall', name: 'Wall', material: 'fixture_material', color: '#888888', solid: true },
    { id: 'fixture_rubble', name: 'Rubble', material: 'fixture_material', color: '#777777', solid: true },
  ],
});
const fixture = (world = new World()) => {
  const data = fixtureData();
  const built = buildRegistry([{ source: 'fixture.json', data }]);
  if (built.issues.length > 0) {
    throw new Error(JSON.stringify(built.issues));
  }
  const { registry } = built;
  const wall = registry.blockIds.get('fixture_wall')!;
  const rubble = registry.blockIds.get('fixture_rubble')!;
  const scale = makeScale(0.5);
  const terrain: Terrain = {
    seed: 5,
    scale,
    blocks: { grass: wall, dirt: wall, rock: wall, sand: wall, water: wall },
    shape: {
      minHeightMetres: 0,
      maxHeightMetres: 0,
      beachBelowMetres: 0,
      dirtDepthMetres: 1,
      featureSizeMetres: 1,
      octaves: 1,
    },
    stamp: (chunk) => {
      if (chunk.cx === 0 && chunk.cy === 0 && chunk.cz === 0) {
        chunk.set(...cell, wall);
        chunk.set(...stampCell, rubble);
      }
    },
  };
  const canonical = new CanonicalTerrain(world, terrain, [
    { min: structureCell, max: structureCell.map((value) => value + 1) as Vec3, block: wall },
  ]);
  return { world, registry, canonical, wall, rubble, material: data.blockMaterials[0]! };
};

describe('block damage foundation', () => {
  it('projects resistance before the strength gate without changing terrain or overlay', () => {
    const { world, material } = fixture();
    for (const kind of BLOCK_DAMAGE_KINDS) {
      const effective = 3 * (1 - material.resistance[kind]);
      const projected = bashBlock({ material, damage: 0 }, { kind, strength: 3 });
      expect(projected.outcome).toBe(effective < material.minimumStrength || effective === 0 ? 'resisted' : 'damaged');
      expect(projected.damage).toBe(projected.outcome === 'resisted' ? 0 : effective);
    }
    expect(world.blockDamage.snapshotState().entries).toEqual([]);
    expect(world.chunks.size).toBe(0);
    const partial = bashBlock({ material, damage: 0 }, { kind: 'blunt', strength: material.minimumStrength });
    expect(partial.outcome).toBe('damaged');
    expect(bashBlock({ material, damage: partial.damage }, { kind: 'breach', strength: material.durability })).toEqual({
      outcome: 'broken',
      damage: material.durability,
    });
  });

  it('reads both stamping passes in scratch, then installs whole columns preserving resident chunks', () => {
    const { world, canonical, wall, rubble } = fixture();
    expect(canonical.getBlock(...stampCell)).toBe(rubble);
    expect(canonical.getBlock(...structureCell)).toBe(wall);
    expect(world.chunks.size).toBe(0);
    expect(world.isTouched(0, 0)).toBe(false);
    const resident = new Chunk(0, canonical.terrain.scale.minCy, 0, rubble);
    world.addChunk(resident);
    canonical.ensureColumn(0, 0);
    expect(world.getChunk(0, resident.cy, 0)).toBe(resident);
    for (let cy = canonical.terrain.scale.minCy; cy <= canonical.terrain.scale.maxCy; cy++) {
      expect(world.getChunk(0, cy, 0)).toBeDefined();
    }
    expect(world.getBlock(...stampCell)).toBe(rubble);
    expect(world.getBlock(...structureCell)).toBe(wall);
    expect(world.isTouched(0, 0)).toBe(true);
  });

  it.each(['partial', 'full'] as const)(
    'round-trips %s damage and epoch through the real save codec and session restore',
    async (amount) => {
      const f = fixture();
      const registry = baseRegistry();
      const offset = registry.blocks.length - 1;
      for (const block of f.registry.blocks.slice(1)) {
        registry.blockIds.set(block.id, registry.blocks.length);
        registry.blocks.push(block);
      }
      for (const [id, material] of f.registry.blockMaterials) {
        registry.blockMaterials.set(id, material);
      }
      const runtime = createRuntime(undefined, false, [[8, 8]], { registry });
      const terrain: Terrain = {
        ...f.canonical.terrain,
        blocks: Object.fromEntries(
          Object.entries(f.canonical.terrain.blocks).map(([key, id]) => [key, id + offset]),
        ) as Terrain['blocks'],
        stamp: (chunk) => {
          if (chunk.cx === 0 && chunk.cy === 0 && chunk.cz === 0) {
            chunk.set(...cell, registry.blockIds.get('fixture_wall')!);
            chunk.set(...stampCell, registry.blockIds.get('fixture_rubble')!);
          }
        },
      };
      const canonical = new CanonicalTerrain(runtime.world, terrain);
      const damage = amount === 'partial' ? f.material.minimumStrength : f.material.durability;
      const entry = runtime.world.blockDamage.record(canonical, registry, cell, damage);
      runtime.world.blockDamage.record(canonical, registry, cell, damage);
      expect(runtime.world.blockDamage.get(cell)?.epoch).toBe(entry.epoch);
      const snapshot = capture(runtime);
      const bytes = await encodeFixture(snapshot);
      const decoded = await decodeSave(bytes, {
        version: formatVersion,
        contentLookup: (kind, id, item) => contentLookup(registry, kind, id, item),
      });
      const restored = createRuntime(decoded.snapshot, false, [[8, 8]], { registry });
      expect(restored.world.blockDamage.snapshotState()).toEqual(snapshot.world.blockDamage);
      expect(restored.world.snapshotColumns((id) => registry.blocks[id]!.id)).toEqual(snapshot.world.columns);
      expect(restored.world.getBlock(...stampCell)).toBe(registry.blockIds.get('fixture_rubble'));
      expect(restored.world.isTouched(0, 0)).toBe(true);
      expect(restored.world.blockDamage.get(cell)).toEqual(entry);
      expect(restored.world.getBlock(...cell)).toBe(registry.blockIds.get('fixture_wall'));
    },
  );

  it('drops and reports invalid overlay entries instead of regenerating terrain', () => {
    const { world, registry, canonical, material } = fixture();
    canonical.ensureColumn(0, 0);
    const noMaterial: Vec3 = [8, 3, 8];
    const air: Vec3 = [9, 3, 9];
    registry.blocks.push({
      id: 'fixture_invalid',
      material: 'missing',
      name: 'Invalid',
      solid: true,
      color: '#000000',
    });
    world.setBlock(...noMaterial, registry.blocks.length - 1);
    const entries = [
      { cell, damage: 0, epoch: 1 },
      { cell, damage: material.durability + 1, epoch: 2 },
      { cell: air, damage: 1, epoch: 3 },
      { cell: noMaterial, damage: 1, epoch: 4 },
      { cell: [CHUNK * 2, 3, 0] as Vec3, damage: 1, epoch: 5 },
      { cell, damage: 1, epoch: 6 },
    ];
    const reports: string[] = [];
    const issues = world.blockDamage.restoreState({ nextEpoch: 7, entries }, registry, (issue) => reports.push(issue));
    expect(reports).toEqual(issues);
    expect(issues).toHaveLength(entries.length - 1);
    expect(issues.every((issue) => issue.startsWith('Dropped invalid block damage at '))).toBe(true);
    expect(world.blockDamage.snapshotState()).toEqual({ nextEpoch: 7, entries: [entries.at(-1)!] });
    expect(world.getChunk(2, 0, 0)).toBeUndefined();
    const next = world.blockDamage.record(canonical, registry, stampCell, 1);
    expect(next.epoch).toBe(7);
  });

  it('replacement ends an epoch and incomplete touched columns never regenerate', () => {
    const { world, registry, canonical, rubble } = fixture();
    const original = world.blockDamage.record(canonical, registry, cell, 1);
    world.setBlock(...cell, rubble);
    expect(world.blockDamage.get(cell)).toBeUndefined();
    expect(world.blockDamage.record(canonical, registry, cell, 1).epoch).toBeGreaterThan(original.epoch);
    world.removeChunk(0, 0, 0);
    expect(() => canonical.getBlock(...cell)).toThrow('Incomplete touched column');
    expect(() => canonical.ensureColumn(0, 0)).toThrow('Incomplete touched column');
    expect(() => new World().touchColumn(0, 0)).toThrow('absent column');
  });
});

describe('block material admission', () => {
  it('rejects absent or unresolved material metadata without fallback', () => {
    for (const material of [undefined, 'missing']) {
      const data = fixtureData();
      const blocks = [{ ...data.blocks[0], material }];
      const { issues } = buildRegistry([{ source: 'fixture.json', data: { ...data, blocks } }]);
      expect(issues.some(({ path }) => path === 'blocks[0].material')).toBe(true);
    }
  });

  it('requires every supported resistance and rejects unknown kinds', () => {
    for (const kind of BLOCK_DAMAGE_KINDS) {
      const data = fixtureData();
      const resistance: Partial<(typeof data.blockMaterials)[number]['resistance']> = {
        ...data.blockMaterials[0]!.resistance,
      };
      delete resistance[kind];
      const { issues } = buildRegistry([
        {
          source: 'fixture.json',
          data: { ...data, blockMaterials: [{ ...fixtureBlockMaterial('fixture_rubble'), resistance }] },
        },
      ]);
      expect(issues.some(({ path }) => path === `blockMaterials[0].resistance.${kind}`)).toBe(true);
    }
    const data = fixtureData();
    data.blockMaterials[0]!.resistance.blunt = -1;
    expect(
      buildRegistry([{ source: 'fixture.json', data }]).issues.some(({ path }) => path.endsWith('.resistance.blunt')),
    ).toBe(true);
    const unknown = fixtureData();
    const material = unknown.blockMaterials[0]!;
    expect(
      buildRegistry([
        {
          source: 'fixture.json',
          data: { ...unknown, blockMaterials: [{ ...material, resistance: { ...material.resistance, heat: 0 } }] },
        },
      ]).issues.some(({ path }) => path.endsWith('.resistance.heat')),
    ).toBe(true);
  });
});
