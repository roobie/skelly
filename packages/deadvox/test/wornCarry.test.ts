// Carry and armour worn on the torso (`DESIGN.md`, "Worn items seen"), drawn from their exported models on the real
// figure: each item shows while worn, taking one off leaves the rest, and the whole kit clears the body and itself.
import { Mesh, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../src/core/content.ts';
import { SLING_SLOT } from '../src/core/firearmFitting.ts';
import { Inventory, wornSlotOf } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { makeScale } from '../src/core/scale.ts';
import type { WearSlot } from '../src/core/schema.ts';
import { itemLook } from '../src/render/itemLook.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { type PlayerFigurePose, PlayerMeshes } from '../src/render/playerFigure.ts';
import { PLAYER_FIGURE_LAYER } from '../src/render/shadowFlags.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { createPlayerBody } from './playerFixture.ts';

const registry = baseRegistry();
const figure = registry.figures.get('player')!;
const onTorso = (def: ItemDef): boolean => def.figureModels?.some((entry) => entry.frame === 'torso') === true;
const sling = [...registry.items.values()].find((def) => def.sling === true && onTorso(def))!;
const slotOf = (def: ItemDef): WearSlot => wornSlotOf(registry, new Inventory(registry).create(def.id))!;
// Every worn item drawn on the torso, by the slot it is worn in.
const bySlot = new Map<WearSlot, ItemDef[]>();
for (const def of registry.items.values()) {
  if (onTorso(def) && wornSlotOf(registry, new Inventory(registry).create(def.id))) {
    bySlot.set(slotOf(def), [...(bySlot.get(slotOf(def)) ?? []), def]);
  }
}
// Outfits that between them wear every such item, one item per slot each.
const outfits = Array.from({ length: Math.max(...[...bySlot.values()].map((defs) => defs.length)) }, (_, index) =>
  [...bySlot.values()].map((defs) => defs[index % defs.length]!),
);
const models = (await loadFigureModels(registry, 'player', [
  ...new Set([...[...bySlot.values()].flat(), sling].flatMap((def) => def.figureModels!.map(({ model }) => model))),
])) as unknown as ModelLibrary;
Object.assign(models, { version: 1 });

const pose = (inventory: Inventory, stance: PlayerFigurePose['stance'] = 'standing'): PlayerFigurePose => ({
  body: createPlayerBody(makeScale(0.5), 2, 0, 3),
  yaw: 0.6,
  stepOffset: 0,
  gaitPhase: 0,
  moving: false,
  stance,
  dt: 1,
  thirdPerson: true,
  inventory,
});

/** Puts an item on, fitting a sling first to a gun carried on the shoulder. */
const wear = (inventory: Inventory, item: Item): Item => {
  if (slotOf(defOfItem(item)) === 'shoulder' && !item.slots?.[SLING_SLOT]) {
    inventory.fitSlot(item, SLING_SLOT, inventory.create(sling.id));
  }
  if (!inventory.add(item, { kind: 'worn' })) {
    throw new Error(`${item.type} could not be worn`);
  }
  return item;
};

const defOfItem = (item: Item): ItemDef => registry.items.get(item.type)!;

const wornObjects = (meshes: PlayerMeshes, slot: WearSlot): Object3D[] =>
  meshes.group.getObjectsByProperty('name', `worn-${slot}`);

/** The drawn meshes under `roots`, short of the worn items hung on a part's wear frames. */
const meshesUnder = (roots: readonly Object3D[]): Mesh[] =>
  roots.flatMap((root) =>
    !root.visible || root.name.startsWith('wear-frame-')
      ? []
      : [...(root instanceof Mesh ? [root] : []), ...meshesUnder(root.children)],
  );

/** How a worn item is drawn: a figure model for it and each item fitted to it, on the figure layer with shadows. */
const drawnAs = (meshes: PlayerMeshes, item: Item) => {
  const owners = [item, ...Object.values(item.slots ?? {}).filter((child) => child !== undefined)];
  const drawn = wornObjects(meshes, slotOf(defOfItem(item)));
  const parts = meshesUnder(drawn);
  return {
    item: item.type,
    models: drawn.length === owners.flatMap((owner) => defOfItem(owner).figureModels ?? []).length,
    drawn: parts.length > 0,
    figureLayer: parts.every((part) => part.layers.isEnabled(PLAYER_FIGURE_LAYER)),
    shadows: parts.every((part) => part.castShadow && part.receiveShadow),
  };
};

describe('worn carry and armour on the figure', () => {
  it('draws each item while it is worn, on the figure layer with shadows, and removes only the item taken off', () => {
    for (const outfit of outfits) {
      const inventory = new Inventory(registry);
      const items = outfit.map((def) => wear(inventory, inventory.create(def.id)));
      const meshes = new PlayerMeshes(0.5, figure, registry.models, models);
      meshes.sync(pose(inventory));
      expect(items.map((item) => drawnAs(meshes, item))).toEqual(
        items.map((item) => ({ item: item.type, models: true, drawn: true, figureLayer: true, shadows: true })),
      );
      const before = new Map(outfit.map((def) => [slotOf(def), wornObjects(meshes, slotOf(def))]));
      for (const [index, item] of items.entries()) {
        expect(inventory.move(item, { kind: 'pile', pos: [index, 0, 0] }).ok).toBe(true);
        meshes.sync(pose(inventory));
        const kept = outfit.slice(index + 1).map(slotOf);
        expect({
          removed: wornObjects(meshes, slotOf(outfit[index]!)),
          kept: kept.map((slot) => wornObjects(meshes, slot)),
        }).toEqual({ removed: [], kept: kept.map((slot) => before.get(slot)) });
      }
    }
  });

  it('draws a slung gun with what is fitted to it', () => {
    const withPart = (bySlot.get('shoulder') ?? [])
      .map((def) => ({
        def,
        slot: itemLook(registry, new Inventory(registry).create(def.id))?.slots.find((s) => s.model),
      }))
      .find((candidate) => candidate.slot !== undefined);
    expect(withPart).toBeDefined();
    const { def: gunDef, slot: fittedSlot } = withPart!;
    const marker = `fitted-${fittedSlot!.slot}`;
    const inventory = new Inventory(registry);
    const meshes = new PlayerMeshes(0.5, figure, registry.models, models);
    const showsPart = (): boolean =>
      wornObjects(meshes, 'shoulder').some((object) => object.getObjectByName(marker) !== undefined);
    const gun = wear(inventory, inventory.create(gunDef.id));
    meshes.sync(pose(inventory));
    expect(showsPart()).toBe(true);
    expect(inventory.move(gun, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    const stripped = inventory.create(gunDef.id);
    inventory.fitSlot(stripped, fittedSlot!.slot, undefined);
    wear(inventory, stripped);
    meshes.sync(pose(inventory));
    expect(wornObjects(meshes, 'shoulder').length).toBeGreaterThan(0);
    expect(showsPart()).toBe(false);
  });

  it('keeps every worn item out of the torso and out of each other, standing and crouched', () => {
    for (const outfit of outfits) {
      const inventory = new Inventory(registry);
      for (const def of outfit) {
        wear(inventory, inventory.create(def.id));
      }
      for (const stance of ['standing', 'crouching'] as const) {
        const meshes = new PlayerMeshes(0.5, figure, registry.models, models);
        meshes.sync(pose(inventory, stance));
        meshes.group.updateMatrixWorld(true);
        // The arms and legs swing and bend through the body as well, so only the torso is a solid here.
        const solids = [
          { name: 'body', shell: shellOf(meshesUnder([meshes.group.getObjectByName('figure-body')!])) },
          ...outfit.map((def) => ({ name: def.id, shell: shellOf(meshesUnder(wornObjects(meshes, slotOf(def)))) })),
        ];
        expect(solids.filter(({ shell }) => shell.points.length === 0)).toEqual([]);
        expect({ stance, overlaps: overlapsOf(solids) }).toEqual({ stance, overlaps: [] });
      }
    }
  });
});

/** Each pair of solids where one reaches inside the other, and by how many probes. */
const overlapsOf = (solids: readonly { name: string; shell: Shell }[]) =>
  solids.flatMap((solid) =>
    solids
      .filter((other) => other !== solid)
      .map((other) => ({
        item: solid.name,
        inside: other.name,
        points: solid.shell.points.filter((point) => other.shell.contains(point)).length,
      }))
      .filter(({ points }) => points > 0),
  );

/** A closed drawn surface: points just inside it at each corner and face, and whether a point lies within it. */
interface Shell {
  points: Vector3[];
  contains: (point: Vector3) => boolean;
}

// Off every voxel face's axis, so a ray from a point never runs along an edge of the surface it counts crossings of.
const ACROSS = new Vector3(1, 0.31, 0.17).normalize();
// How far inside its surface each probe sits, well under a voxel: faces that only touch another's are not inside it.
const INSET = 0.001;

type Triangle = readonly [Vector3, Vector3, Vector3];

const trianglesOf = (part: Mesh): Triangle[] => {
  const position = part.geometry.getAttribute('position');
  const index = part.geometry.getIndex();
  const vertex = (i: number): Vector3 =>
    new Vector3().fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(part.matrixWorld);
  return Array.from({ length: (index ? index.count : position.count) / 3 }, (_, t) => [
    vertex(3 * t),
    vertex(3 * t + 1),
    vertex(3 * t + 2),
  ]);
};

/** Points just inside the surface behind a triangle, near each corner and at its centre. */
const probesOf = ([a, b, c]: Triangle): Vector3[] => {
  const inward = new Vector3().crossVectors(c.clone().sub(a), b.clone().sub(a)).normalize();
  const centre = a.clone().add(b).add(c).divideScalar(3);
  return [a, b, c, centre].map((corner) => {
    const towardCentre = centre.clone().sub(corner);
    const step = Math.min(INSET, towardCentre.length() / 2);
    return corner.clone().addScaledVector(towardCentre.normalize(), step).addScaledVector(inward, INSET);
  });
};

/** Whether a ray from `point` along `ACROSS` crosses the triangle (Möller–Trumbore). */
const crosses = (point: Vector3, [a, b, c]: Triangle): boolean => {
  const edge1 = b.clone().sub(a);
  const edge2 = c.clone().sub(a);
  const p = new Vector3().crossVectors(ACROSS, edge2);
  const det = edge1.dot(p);
  if (Math.abs(det) < 1e-12) {
    return false;
  }
  const s = point.clone().sub(a);
  const u = s.dot(p) / det;
  const q = new Vector3().crossVectors(s, edge1);
  const v = ACROSS.dot(q) / det;
  return u >= 0 && v >= 0 && u + v <= 1 && edge2.dot(q) / det > 1e-9;
};

/** The world-space surface of `parts`. */
const shellOf = (parts: readonly Mesh[]): Shell => {
  const triangles = parts.flatMap(trianglesOf);
  const points = new Map(
    triangles.flatMap(probesOf).map((probe) => [
      probe
        .toArray()
        .map((value) => value.toFixed(5))
        .join(','),
      probe,
    ]),
  );
  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const corner of triangles.flat()) {
    min.min(corner);
    max.max(corner);
  }
  const bounds = { min, max };
  return {
    points: [...points.values()],
    // An odd number of crossings along a ray leaves the point inside.
    contains: (point) =>
      point.clone().clamp(bounds.min, bounds.max).equals(point) &&
      triangles.filter((triangle) => crosses(point, triangle)).length % 2 === 1,
  };
};
