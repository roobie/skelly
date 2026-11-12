import type { FurnitureDef } from '@skelly/engine/content';
import type { ColumnReveal } from '@skelly/engine/mesh';
import { BLOCK_SIZE, BlockEntities, type BlockEntity, CHUNK, type Facing, type Vec3 } from '@skelly/engine/world';
import { FurnitureMeshes } from '@skelly/presentation/internal/render/furniture.ts';
import {
  type EventDispatcher,
  InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  Mesh as MeshClass,
  type MeshLambertMaterial,
  type Object3D,
} from 'three';
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
const door = {
  ...plain,
  id: 'fixture_batched_door',
  size: [2, 3, 1],
  door: { handlingSimSeconds: 0.5, methods: {} },
};

function fixture() {
  const { registry, issues } = buildFixtureRegistry([
    { source: 'batched-fixture.json', data: { furniture: [plain, shaped, door] } },
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

/** What a view draws, as geometry, look and world transforms, in a form two views' own resources compare by. */
const drawnState = (furniture: FurnitureMeshes) => {
  furniture.group.updateMatrixWorld(true);
  const look = ({ geometry, material }: Mesh) => {
    const { color, vertexColors, defines } = material as MeshLambertMaterial;
    return `${geometry.getAttribute('position').count}:${color.getHexString()}:${vertexColors}:${'SKY_ANCHOR' in (defines ?? {})}`;
  };
  const batches: string[] = [];
  const loose: string[] = [];
  for (const child of furniture.group.children) {
    if (child instanceof InstancedMesh) {
      const instances = Array.from({ length: child.count }, (_, index) => {
        const instance = new Matrix4();
        child.getMatrixAt(index, instance);
        return instance.premultiply(child.matrixWorld).toArray().join(',');
      });
      batches.push(`${look(child)}|${instances.join(';')}`);
      continue;
    }
    child.traverseVisible((part) => {
      if (part instanceof MeshClass) {
        loose.push(`${look(part)}|${part.matrixWorld.toArray().join(',')}`);
      }
    });
  }
  return { batches: batches.sort(), loose: loose.sort() };
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

  it('draws after each change only what a fresh view looking at every piece draws', () => {
    const { registry, entities } = fixture();
    const reveal = revealUpTo(CHUNK);
    const furniture = new FurnitureMeshes(BLOCK_SIZE, reveal, undefined, 1);
    const synced = () => {
      furniture.sync(entities);
      const fresh = new FurnitureMeshes(BLOCK_SIZE, reveal, undefined, 1);
      fresh.sync(entities);
      expect(drawnState(furniture)).toEqual(drawnState(fresh));
      fresh.dispose();
    };
    const spec = (id: string, pos: Vec3) => ({
      type: id,
      size: registry.furniture.get(id)!.size,
      pos,
      facing: 'n' as const,
    });
    const kept = entities.add(spec(plain.id, [1, 1, 1]))!;
    const slid = entities.add(spec(plain.id, [1, 1, 3]))!;
    const removed = entities.add(spec(shaped.id, [4, 1, 6]))!;
    const leaf = entities.add(spec(door.id, [CHUNK + 1, 1, 1]))!;
    synced();

    entities.slide(slid, [4, 1, 3]);
    synced();
    entities.setOpen(leaf, true);
    synced();
    reveal.revealedBelowX = 2 * CHUNK;
    reveal.revealVersion += 1;
    synced();
    entities.lift(kept);
    synced();
    entities.place(kept, [CHUNK + 4, 1, 4]);
    entities.remove(removed);
    synced();

    const saved = entities.snapshotState();
    entities.slide(slid, [6, 1, 3]);
    entities.setOpen(leaf, false);
    synced();
    entities.restoreState(saved);
    synced();
  });

  it('stands a frozen loose piece where its unfrozen standalone mesh stands, before and after a move restages it', () => {
    const { registry, entities } = fixture();
    const def = registry.furniture.get(door.id)!;
    const leaf = entities.add({ type: def.id, size: def.size, pos: [2, 1, 3], facing: 'n' })!;
    const furniture = new FurnitureMeshes(BLOCK_SIZE);
    // Doors and other pieces that move between syncs draw as their own meshes, frozen where they
    // stand (render/staticMatrices.ts): a restage must land the fresh mesh at its new place, not at a
    // stale or never-composed matrix. The standalone `pieceMesh` stays unfrozen, so it is the reference.
    const worldsOf = (root: Object3D): string[] => {
      root.updateMatrixWorld(true);
      const worlds: string[] = [];
      root.traverseVisible((part) => {
        if (part instanceof MeshClass) {
          worlds.push(part.matrixWorld.toArray().join(','));
        }
      });
      return worlds.sort();
    };
    const drawnLoose = (): string[] => {
      furniture.sync(entities);
      return furniture.group.children.flatMap((child) => (child instanceof InstancedMesh ? [] : worldsOf(child)));
    };
    expect(drawnLoose(), 'drawn where it stands').toEqual(worldsOf(furniture.pieceMesh(leaf, def)));
    entities.slide(leaf, [6, 1, 3]);
    expect(drawnLoose(), 'restaged where it was moved').toEqual(worldsOf(furniture.pieceMesh(leaf, def)));
  });

  it('frees a replaced batch alone, and on teardown frees each batch and shared resource once', () => {
    const { registry, entities } = fixture();
    const def = registry.furniture.get(plain.id)!;
    const shapedDef = registry.furniture.get(shaped.id)!;
    entities.add({ type: def.id, size: def.size, pos: [1, 1, 1], facing: 'n' });
    const moved = entities.add({ type: def.id, size: def.size, pos: [1, 1, 3], facing: 'n' })!;
    entities.add({ type: shapedDef.id, size: shapedDef.size, pos: [1, 1, 6], facing: 'n' });
    const furniture = new FurnitureMeshes(BLOCK_SIZE, undefined, undefined, 1);
    const freed = new Map<object, number>();
    const watch = (resource: EventDispatcher<{ dispose: object }>) => {
      if (!freed.has(resource)) {
        freed.set(resource, 0);
        resource.addEventListener('dispose', () => freed.set(resource, freed.get(resource)! + 1));
      }
    };
    const batches = () =>
      furniture.group.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
    const watchDrawn = () => {
      for (const batch of batches()) {
        watch(batch);
        watch(batch.geometry);
        watch(batch.material as Material);
      }
    };
    furniture.sync(entities);
    watchDrawn();
    const replaced = batches().find((batch) => batch.count === 2)!;

    entities.slide(moved, [CHUNK + 1, 1, 3]);
    furniture.sync(entities);
    watchDrawn();
    expect([...freed].filter(([, count]) => count > 0)).toEqual([[replaced, 1]]);

    furniture.dispose();
    expect([...freed.values()].every((count) => count === 1)).toBe(true);
    expect(furniture.group.children).toEqual([]);
  });
});
