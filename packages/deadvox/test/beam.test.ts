import { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import { buildRegistry } from '@skelly/engine/internal/core/content.ts';
import type { BlockDef } from '@skelly/engine/internal/core/schema.ts';
import { gameMinutes, gameSeconds } from '@skelly/engine/internal/core/time.ts';
import { World } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';
import generated from './fixtures/content/beams.json' with { type: 'json' };
import { fixtureTerrain } from './fixtures/terrain.ts';

const char: BlockDef = {
  id: 'fixture_char',
  material: 'fixture_char_material',
  name: 'Fixture char',
  color: '#222222',
  solid: true,
};
const blocks = generated.blocks as BlockDef[];
const material = {
  ...fixtureBlockMaterial(char.id),
  flammability: { ignitionStrength: 1, burnDurationGameMinutes: gameMinutes(1), burnsTo: char.id },
};
const charMaterial = { ...fixtureBlockMaterial(char.id), id: char.material, span: 0 };

describe('beam load-path content', () => {
  it('generates each fixture material row on both axes with override or material fallback', () => {
    for (const row of ['override', 'fallback']) {
      for (const axis of ['x', 'z']) {
        const beam = blocks.find(({ id }) => id === `fixture_${row}_beam_${axis}`);
        expect(beam?.loadPath).toEqual({ kind: 'beam', axis, ...(row === 'override' ? { span: 1.25 } : {}) });
        expect(beam?.burnsTo).toBe(char.id);
      }
    }
    const result = buildRegistry([
      { source: 'fixture', data: { blocks: [...blocks, char], blockMaterials: [material, charMaterial] } },
    ]);
    expect(
      result.issues.filter(({ path }) => ['.loadPath', '.strut', '.burnsTo'].some((field) => path.includes(field))),
    ).toEqual([]);
  });

  it('rejects a beam using a non-structural material or incompatible shape', () => {
    const invalid = [
      { ...blocks[0]!, id: 'fixture_soft_beam', material: 'fixture_soft' },
      { ...blocks[0]!, id: 'fixture_wire_beam', wireMesh: { cellsPerBlock: 2, wireFraction: 0.1 } },
    ];
    const result = buildRegistry([
      {
        source: 'fixture',
        data: {
          blocks: [...invalid, char],
          blockMaterials: [material, charMaterial, { ...material, id: 'fixture_soft', structural: false }],
        },
      },
    ]);
    expect(
      result.issues
        .filter(({ message }) => message.includes('beams require'))
        .map(({ message }) => message)
        .sort(),
    ).toEqual(['beams require a structural material', 'beams require solid bodies and no other shape']);
  });

  it.each(['x', 'z'])('burns a fixture beam on axis %s to the same zero-span unoriented char', (axis) => {
    const registry = baseRegistry();
    registry.blockMaterials.set(material.id, material);
    registry.blockMaterials.set(charMaterial.id, charMaterial);
    for (const block of [...blocks, char]) {
      registry.blockIds.set(block.id, registry.blocks.length);
      registry.blocks.push(block);
    }
    const world = new World();
    const terrain = new CanonicalTerrain(
      world,
      fixtureTerrain({ scale: { blockSize: 0.5, minCy: 0, maxCy: 0 }, floor: 0 }),
    );
    terrain.ensureCell(0, 3, 0);
    world.setBlock(0, 3, 0, registry.blockIds.get(`fixture_override_beam_${axis}`)!);
    expect(world.fire.ignite(terrain, registry, [0, 3, 0], 2)).toBe(true);
    world.fire.tick(terrain, registry, gameSeconds(60), 1);
    expect(registry.blocks[terrain.getBlock(0, 3, 0)]).toEqual(char);
    expect(world.support.cascading).toBe(true);
  });
});
