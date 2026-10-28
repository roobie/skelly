// Carry and armour worn on the torso (`DESIGN.md`, "Worn items seen"), drawn from their exported models on the real
// figure: each item shows while worn, taking one off leaves the rest, and the whole kit clears the body and itself.
import { Box3, Mesh, type Object3D, Ray, Vector3 } from 'three';
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
const torsoGarments = [...registry.items.values()].filter(
  (def) => def.wearable?.slot === 'torso' && def.figureModels !== undefined,
);
const outerTorso = [...registry.items.values()].filter(
  (def) => def.wearable !== undefined && def.figureModels?.some((entry) => entry.overTorso !== undefined),
);
const models = (await loadFigureModels(registry, 'player', [
  ...new Set(
    [...[...bySlot.values()].flat(), sling, ...torsoGarments, ...outerTorso].flatMap((def) =>
      def.figureModels!.flatMap(({ model, overTorso }) => [model, ...Object.values(overTorso ?? {})]),
    ),
  ),
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
  it('switches every outer torso item to each torso garment fit without interpenetration', () => {
    expect(outerTorso.length).toBeGreaterThan(0);
    expect(torsoGarments.length).toBeGreaterThan(0);
    const bodyFrames = new Set(
      Object.entries(figure.attachmentFrames)
        .filter(([, attachment]) => attachment.part === 'body')
        .map(([name]) => `wear-frame-${name}`),
    );
    for (const garmentDef of torsoGarments) {
      for (const outerDef of outerTorso) {
        const inventory = new Inventory(registry);
        wear(inventory, inventory.create(outerDef.id));
        const meshes = new PlayerMeshes(0.5, figure, registry.models, models);
        meshes.sync(pose(inventory));
        const slot = slotOf(outerDef);
        const [bare] = wornObjects(meshes, slot);
        expect(bare).toBeDefined();
        const garment = wear(inventory, inventory.create(garmentDef.id));
        meshes.sync(pose(inventory));
        meshes.group.updateMatrixWorld(true);
        const outer = wornObjects(meshes, slot);
        const inner = wornObjects(meshes, 'torso').filter((object) => bodyFrames.has(object.parent!.name));
        expect(outer[0]).not.toBe(bare);
        const surfaces = [
          { name: garmentDef.id, shell: shellOf(meshesUnder(inner)) },
          { name: outerDef.id, shell: shellOf(meshesUnder(outer)) },
        ];
        expect(surfaces.every(({ shell }) => shell.points.length > 0)).toBe(true);
        expect(overlapsOf(surfaces), `${outerDef.id} over ${garmentDef.id}`).toEqual([]);
        if (slot === 'vest') {
          const frame = meshes.group.getObjectByName('wear-frame-torso')!;
          const anchors = registry.models.get(figure.body.model)!.anchors!;
          const chest = new Vector3(...anchors[figure.body.joints.leftShoulder]!)
            .add(new Vector3(...anchors[figure.body.joints.rightShoulder]!))
            .multiplyScalar(0.5);
          const vestFront = frontAt(meshesUnder(outer), frame, chest);
          const garmentFront = frontAt(meshesUnder(inner), frame, chest);
          expect(vestFront.length).toBeGreaterThan(0);
          expect(garmentFront.length).toBeGreaterThan(0);
          expect(Math.min(...vestFront)).toBeGreaterThan(Math.max(...garmentFront));
        }
        expect(inventory.move(garment, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
        meshes.sync(pose(inventory));
        expect(wornObjects(meshes, slot)[0]).not.toBe(outer[0]);
        meshes.dispose();
      }
    }
  });

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

  it.each(['standing', 'crouching'] as const)(
    'keeps every worn item out of the torso and out of each other, %s',
    (stance) => {
      for (const outfit of outfits) {
        const inventory = new Inventory(registry);
        for (const def of outfit) {
          wear(inventory, inventory.create(def.id));
        }
        const meshes = new PlayerMeshes(0.5, figure, registry.models, models);
        meshes.sync(pose(inventory, stance));
        meshes.group.updateMatrixWorld(true);
        // The arms and legs swing and bend through the body as well, so only the torso is a solid here.
        const solids = [
          { name: 'body', shell: shellOf(meshesUnder([meshes.group.getObjectByName('figure-body')!])) },
          ...outfit.map((def) => ({ name: def.id, shell: shellOf(meshesUnder(wornObjects(meshes, slotOf(def)))) })),
        ];
        expect(solids.filter(({ shell }) => shell.points.length === 0)).toEqual([]);
        expect(overlapsOf(solids)).toEqual([]);
      }
    },
  );
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

/** Both sides of the front shell at the chest, so an outer face cannot conceal an embedded inner face. */
const frontAt = (parts: readonly Mesh[], frame: Object3D, chest: Vector3): number[] => {
  const triangles = parts
    .flatMap(trianglesOf)
    .map(([a, b, c]): Triangle => [frame.worldToLocal(a), frame.worldToLocal(b), frame.worldToLocal(c)]);
  const bounds = new Box3().setFromPoints(triangles.flat());
  const origin = chest.clone();
  origin.z = bounds.max.z + bounds.getSize(new Vector3()).z;
  const ray = new Ray(origin, new Vector3(0, 0, -1));
  return triangles.flatMap(([a, b, c]) => {
    const hit = ray.intersectTriangle(a, b, c, false, new Vector3());
    return hit && hit.z > chest.z ? [hit.z] : [];
  });
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

/** The terms of a ray–triangle test (Möller–Trumbore) along `ACROSS` that do not depend on the ray's start. */
interface Crossing {
  a: Vector3;
  edge1: Vector3;
  edge2: Vector3;
  p: Vector3;
  det: number;
}

const crossingOf = ([a, b, c]: Triangle): Crossing => {
  const edge1 = b.clone().sub(a);
  const edge2 = c.clone().sub(a);
  const p = new Vector3().crossVectors(ACROSS, edge2);
  return { a, edge1, edge2, p, det: edge1.dot(p) };
};

const fromCorner = new Vector3();
const across = new Vector3();
/** Whether a ray from `point` along `ACROSS` crosses the triangle. */
const crosses = (point: Vector3, { a, edge1, edge2, p, det }: Crossing): boolean => {
  if (Math.abs(det) < 1e-12) {
    return false;
  }
  const u = fromCorner.subVectors(point, a).dot(p) / det;
  if (u < 0 || u > 1) {
    return false;
  }
  const v = ACROSS.dot(across.crossVectors(fromCorner, edge1)) / det;
  return v >= 0 && u + v <= 1 && edge2.dot(across) / det > 1e-9;
};

/** The world-space surface of `parts`. */
const shellOf = (parts: readonly Mesh[]): Shell => {
  const triangles = parts.flatMap(trianglesOf);
  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const corner of triangles.flat()) {
    min.min(corner);
    max.max(corner);
  }
  const crossings = triangles.map(crossingOf);
  const bounds = new Box3(min, max);
  return {
    points: triangles.flatMap(probesOf),
    // An odd number of crossings along a ray leaves the point inside.
    contains: (point) =>
      bounds.containsPoint(point) && crossings.filter((crossing) => crosses(point, crossing)).length % 2 === 1,
  };
};
