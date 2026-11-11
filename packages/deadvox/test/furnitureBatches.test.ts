import type { FurnitureDef } from '@skelly/engine/content';
import type { ColumnReveal } from '@skelly/engine/mesh';
import { BLOCK_SIZE, BlockEntities, type BlockEntity, CHUNK, type Facing, type Vec3 } from '@skelly/engine/world';
import { FurnitureMeshes } from '@skelly/presentation/internal/render/furniture.ts';
import { InstancedMesh, Matrix4, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { buildFixtureRegistry, FIXTURE_MATERIAL, fixtureBreach } from './economyFixtures.ts';

const plain = {
  id: 'fixture_batched_box',
  name: 'Fixture box',
  size: [2, 1, 1],
  color: '#7a6248',
  breach: fixtureBreach(),
  material: FIXTURE_MATERIAL,
};
const shaped = {
  ...plain,
  id: 'fixture_batched_shape',
  size: [1, 2, 2],
  shape: [
    { position: [0, 0, 0], size: [1, 1, 2] },
    { position: [0, 1, 1.5], size: [1, 1, 0.5], color: '#506070' },
  ],
  solidFill: 0.01,
};

function fixture() {
  const { registry, issues } = buildFixtureRegistry([
    { source: 'batched-fixture.json', data: { furniture: [plain, shaped] } },
  ]);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  return { registry, entities: new BlockEntities(registry) };
}

/** Columns west of `revealedBelowX` are revealed; raising it reveals more. */
const revealUpTo = (revealedBelowX: number) => {
  const reveal = {
    revealVersion: 0,
    isRevealed: (x: number) => x < reveal.revealedBelowX,
    revealedBelowX,
  };
  return reveal satisfies ColumnReveal;
};

/** Every drawn batch instance's world matrix, with the geometry and material it draws. */
const drawnInstances = (furniture: FurnitureMeshes) => {
  furniture.group.updateMatrixWorld(true);
  return furniture.group.children
    .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
    .flatMap((batch) =>
      Array.from({ length: batch.count }, (_, index) => {
        const instance = new Matrix4();
        batch.getMatrixAt(index, instance);
        return {
          geometry: batch.geometry,
          material: batch.material,
          matrix: instance.premultiply(batch.matrixWorld).toArray(),
        };
      }),
    );
};

/** Whether `drawn` is `matrix` as the GPU receives either: in single precision. */
const sameMatrix = (drawn: readonly number[], matrix: Matrix4) =>
  matrix.toArray().every((value, index) => Math.fround(value) === drawn[index]);

/** The drawn instances that draw `entity` as its standalone mesh would. */
const drawsOf = (furniture: FurnitureMeshes, entity: BlockEntity, def: FurnitureDef) => {
  const alone = furniture.pieceMesh(entity, def) as Mesh;
  alone.updateMatrixWorld(true);
  return drawnInstances(furniture).filter(
    (drawn) =>
      drawn.geometry === alone.geometry &&
      drawn.material === alone.material &&
      sameMatrix(drawn.matrix, alone.matrixWorld),
  );
};

describe('furniture batches', () => {
  it('draws each revealed standing piece once, at the transform its standalone mesh has', () => {
    const { registry, entities } = fixture();
    const facings: Facing[] = ['n', 'e', 's', 'w'];
    const placed = [plain, shaped].flatMap(({ id }, row) =>
      facings.map((facing, column) => {
        const def = registry.furniture.get(id)!;
        const size: Vec3 = facing === 'e' || facing === 'w' ? [def.size[2], def.size[1], def.size[0]] : [...def.size];
        return entities.add({ type: id, size, pos: [column * CHUNK + 3, 1, row * 4], facing })!;
      }),
    );
    const furniture = new FurnitureMeshes(BLOCK_SIZE, undefined, undefined, 1);
    furniture.sync(entities);
    for (const entity of placed) {
      expect(drawsOf(furniture, entity, entities.defOf(entity))).toHaveLength(1);
    }
    expect(drawnInstances(furniture)).toHaveLength(placed.length);
  });

  it('leaves an unrevealed piece out of every batch until its column is revealed', () => {
    const { registry, entities } = fixture();
    const def = registry.furniture.get(plain.id)!;
    const near = entities.add({ type: def.id, size: def.size, pos: [1, 1, 1], facing: 'n' })!;
    const far = entities.add({ type: def.id, size: def.size, pos: [CHUNK + 1, 1, 1], facing: 'n' })!;
    const reveal = revealUpTo(CHUNK);
    const furniture = new FurnitureMeshes(BLOCK_SIZE, reveal);
    furniture.sync(entities);
    expect(drawsOf(furniture, near, def)).toHaveLength(1);
    expect(drawsOf(furniture, far, def)).toHaveLength(0);

    reveal.revealedBelowX = 2 * CHUNK;
    reveal.revealVersion += 1;
    furniture.sync(entities);
    expect(drawsOf(furniture, near, def)).toHaveLength(1);
    expect(drawsOf(furniture, far, def)).toHaveLength(1);
  });

  it('redraws a slid piece at its new place only, and still draws its batch-mates', () => {
    const { registry, entities } = fixture();
    const def = registry.furniture.get(plain.id)!;
    const still = entities.add({ type: def.id, size: def.size, pos: [1, 1, 1], facing: 'n' })!;
    const slid = entities.add({ type: def.id, size: def.size, pos: [1, 1, 3], facing: 'n' })!;
    const furniture = new FurnitureMeshes(BLOCK_SIZE);
    furniture.sync(entities);
    const before = furniture.pieceMesh(slid, def);
    before.updateMatrixWorld(true);

    entities.slide(slid, [4, 1, 3]);
    furniture.sync(entities);
    expect(drawsOf(furniture, still, def)).toHaveLength(1);
    expect(drawsOf(furniture, slid, def)).toHaveLength(1);
    expect(drawnInstances(furniture).filter(({ matrix }) => sameMatrix(matrix, before.matrixWorld))).toEqual([]);
  });
});
