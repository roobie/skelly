import { Box3, BoxGeometry, Group, Mesh, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlockEntities, type BlockEntity, isBodyDoor, panelFor } from '../src/core/blockEntities.ts';
import { BLOCK_SIZE } from '../src/core/scale.ts';
import type { FurnitureDef } from '../src/core/schema.ts';
import type { Facing } from '../src/core/templates.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const doors = [...registry.furniture.values()].filter((def) => def.door !== undefined);
// A shaped leaf's own shape is its look; the leaf is checked for its swing only where it is the whole piece.
const leaves = doors.filter((def) => def.door?.detail && !def.shape);
// Hardware and relief stand this far off the panel at most.
const PROUD_M = 0.15;

const meshesOf = (object: Object3D): Mesh[] => {
  const found: Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof Mesh) {
      found.push(child);
    }
  });
  return found;
};

const boundsOf = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

const panelBounds = (entity: BlockEntity, def: FurnitureDef): Box3 => {
  const panel = panelFor(entity, def, BLOCK_SIZE);
  const pivot = new Group();
  const box = new Mesh(new BoxGeometry(...panel.size));
  pivot.position.set(...panel.pivot);
  pivot.rotation.y = panel.rotationY;
  box.position.set(...panel.center);
  pivot.add(box);
  return boundsOf(pivot);
};

const cellBounds = (entity: BlockEntity): Box3 =>
  new Box3(
    new Vector3(...entity.pos).multiplyScalar(BLOCK_SIZE),
    new Vector3(...entity.pos).add(new Vector3(...entity.size)).multiplyScalar(BLOCK_SIZE),
  );

const place = (entities: BlockEntities, def: FurnitureDef, facing: Facing, slot: number): BlockEntity => {
  const [w, h, d] = def.size;
  const size: [number, number, number] = facing === 'e' || facing === 'w' ? [d, h, w] : [w, h, d];
  return entities.add({ type: def.id, size, pos: [slot * 16, 2, 4], facing })!;
};

describe('door detail', () => {
  it('gives every shipped doorway leaf and hatch that has no shape of its own a detail', () => {
    const plain = doors.filter((def) => !(isBodyDoor(def) || def.shape || def.door?.detail)).map((def) => def.id);
    expect(plain).toEqual([]);
    expect(leaves.some((def) => def.door?.hatch)).toBe(true);
    expect(leaves.some((def) => !def.door?.hatch)).toBe(true);
  });

  it('draws each detailed leaf as one object inside its cells while shut, swinging with its panel when open', () => {
    const entities = new BlockEntities(registry);
    const furniture = new FurnitureMeshes(BLOCK_SIZE);
    const facings: Facing[] = ['n', 'e', 's', 'w'];
    // One object that covers its panel's middle and stands little proud of it.
    const leafOnPanel = (entity: BlockEntity, def: FurnitureDef, label: string): Box3 => {
      const piece = furniture.pieceMesh(entity, def);
      expect(meshesOf(piece), label).toHaveLength(1);
      const bounds = boundsOf(piece);
      const panel = panelBounds(entity, def);
      expect(bounds.containsPoint(panel.getCenter(new Vector3())), label).toBe(true);
      expect(panel.expandByScalar(PROUD_M).containsBox(bounds), label).toBe(true);
      return bounds;
    };
    for (const [index, def] of leaves.entries()) {
      for (const [turn, facing] of facings.entries()) {
        const entity = place(entities, def, facing, index * facings.length + turn);
        const label = `${def.id} ${facing}`;
        const shut = leafOnPanel(entity, def, label);
        expect(cellBounds(entity).expandByScalar(1e-6).containsBox(shut), label).toBe(true);
        expect(entities.setOpen(entity, true), label).toBeUndefined();
        leafOnPanel(entity, def, `${label} open`);
      }
    }
  });

  it('builds a leaf once per definition and size, shared by every instance shut or open', () => {
    const entities = new BlockEntities(registry);
    const furniture = new FurnitureMeshes(BLOCK_SIZE);
    for (const hatch of [false, true]) {
      const def = leaves.find((candidate) => (candidate.door?.hatch ?? false) === hatch)!;
      const first = place(entities, def, 'n', hatch ? 0 : 2);
      const second = place(entities, def, 'n', hatch ? 1 : 3);
      const { geometry } = meshesOf(furniture.pieceMesh(first, def))[0]!;
      expect(meshesOf(furniture.pieceMesh(second, def))[0]!.geometry).toBe(geometry);
      entities.setOpen(first, true);
      expect(meshesOf(furniture.pieceMesh(first, def))[0]!.geometry).toBe(geometry);
    }
  });
});
