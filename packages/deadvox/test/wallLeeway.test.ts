// Throwaway wall-leeway spike: the two detectors against compiled furniture and the renderer's placement.
import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import { BlockEntities, type BlockEntity, type EntitySpec } from '../src/core/blockEntities.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { heldFirearmTransform } from '../src/core/heldPose.ts';
import { rotatedSize, rotationOf, type Tip } from '../src/core/orientation.ts';
import { BLOCK_SIZE } from '../src/core/scale.ts';
import type { Facing } from '../src/core/templates.ts';
import type { World } from '../src/core/world.ts';
import {
  compareWalls,
  type GunProxy,
  gatherWallBoxes,
  gunProxy,
  panelBox,
  proxyContact,
  shapeBoxes,
  type WallBox,
  type WallMode,
  type WallPoseSample,
  type WallWorld,
  wallTuning,
} from '../src/debug/wallLeeway.ts';
import { firearmModelForType } from '../src/game/firearmHandling.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const s = BLOCK_SIZE;
const furniture = (id: string) => registry.furniture.get(id)!;
const blockId = (id: string) => registry.blocks.findIndex((block) => block.id === id);

type Terrain = (x: number, y: number, z: number) => number;

const worldWith = (pieces: readonly EntitySpec[], terrain: Terrain = () => 0) => {
  const entities = new BlockEntities(registry);
  const placed = pieces.map((piece) => entities.add(piece)!);
  const world: WallWorld = {
    world: { getBlock: terrain } as unknown as World,
    registry,
    entities,
    solid: (x, y, z) => {
      const block = terrain(x, y, z);
      return (block !== 0 && registry.blocks[block]!.solid) || entities.isSolid(x, y, z);
    },
    blockSize: s,
  };
  return { world, placed };
};

const spec = (type: string, pos: Vec3, facing: Facing = 'n', tip?: Tip): EntitySpec => ({
  type,
  pos,
  facing,
  ...(tip ? { tip } : {}),
  size: rotatedSize(furniture(type).size, rotationOf({ facing, tip })),
});

/** A sphere of `radius` at `at` (metres): a proxy whose sweep has no length. */
const sphere = (at: Vec3, radius = 0.02): GunProxy => ({ butt: at, muzzle: at, tip: at, radius });

const clearances = (world: WallWorld, proxy: GunProxy, low: Vec3, high: Vec3): Record<WallMode, number> => ({
  cells: proxyContact(proxy, gatherWallBoxes(world, 'cells', low, high)).clearance,
  refined: proxyContact(proxy, gatherWallBoxes(world, 'refined', low, high)).clearance,
});

const union = (boxes: readonly WallBox[]): { min: Vec3; max: Vec3 } => ({
  min: [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box.min[axis]!))) as Vec3,
  max: [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box.max[axis]!))) as Vec3,
});

const rifleSample = (eye: Vec3, yaw: number, pitch: number): WallPoseSample => {
  const tuning = registry.skills.get(CORE_CONTENT_IDS.firearmsCombat)!.combat!.firearms!;
  return {
    pose: {
      holds: registry.figures.get(CORE_CONTENT_IDS.player)!.holds,
      model: firearmModelForType('rifle_hunting', registry)!,
      side: 'right',
      leadingSide: 'right',
      twoHanded: true,
      progress: 1,
      aimingDownSights: false,
      aimFrame: NEUTRAL_AIM,
      loweredPitchRadians: tuning.loweredPitchRadians,
      adsApertureFill: tuning.adsApertureFill,
      verticalFovDegrees: 70,
      handlingTurn: [0, 0, 0],
    },
    eye,
    yaw,
    pitch,
    blockSize: s,
  };
};

describe('wall leeway spike', () => {
  it('a closed door leaf lets refined approach closer by the cell depth the panel leaves, from either side', () => {
    const { world, placed } = worldWith([spec('wood_door', [0, 0, 0])]);
    const door = placed[0]!;
    const panel = panelBox(door, furniture('wood_door'), s);
    const cellDepth = door.size[2] * s;
    const panelDepth = panel.max[2] - panel.min[2];
    const low: Vec3 = [-1, -1, -2];
    const high: Vec3 = [3, 5, 3];
    const height = 1;
    const south = clearances(world, sphere([0.5, height, cellDepth + 0.1]), low, high);
    const north = clearances(world, sphere([0.5, height, -0.1]), low, high);
    expect(panelDepth).toBeLessThan(cellDepth);
    expect(south.refined - south.cells).toBeCloseTo(cellDepth - panel.max[2], 6);
    expect(north.refined - north.cells).toBeCloseTo(panel.min[2], 6);
    // The leaf sits centred in its cell, so the excess is the same on both sides.
    expect(south.refined - south.cells).toBeCloseTo((cellDepth - panelDepth) / 2, 6);
  });

  describe('range table', () => {
    const { world, placed } = worldWith([spec('range_table', [0, 0, 0])]);
    const table = placed[0]!;
    const parts = shapeBoxes(table, furniture('range_table'), s);
    const top = parts.reduce((best, box) => (box.max[1] > best.max[1] ? box : best));
    const leg = parts
      .filter((box) => box.min[1] === 0)
      .reduce((best, box) => (box.max[0] + box.max[2] < best.max[0] + best.max[2] ? box : best));
    const low: Vec3 = [-1, -1, -1];
    const high: Vec3 = [5, 3, 3];
    const middle: Vec3 = [(table.size[0] * s) / 2, 0, (table.size[2] * s) / 2];

    it('from above, refined gains the space between the top and its cell top', () => {
      const gap = clearances(world, sphere([middle[0], table.size[1] * s + 0.1, middle[2]]), low, high);
      expect(gap.refined - gap.cells).toBeCloseTo(table.size[1] * s - top.max[1], 6);
    });

    it('from below, between the legs, refined gains the space from the cell row up to the top', () => {
      const underTop = Math.ceil(top.min[1] / s - 1) * s;
      const gap = clearances(world, sphere([middle[0], underTop - 0.15, middle[2]]), low, high);
      expect(gap.refined - gap.cells).toBeCloseTo(top.min[1] - underTop, 6);
    });

    it("beside a leg's inside face, refined gains the rest of the leg's cell", () => {
      const legCellEdge = Math.ceil(leg.max[0] / s) * s;
      const at: Vec3 = [legCellEdge + 0.1, leg.max[1] / 4, (leg.min[2] + leg.max[2]) / 2];
      const gap = clearances(world, sphere(at), low, high);
      expect(gap.refined - gap.cells).toBeCloseTo(legCellEdge - leg.max[0], 6);
    });
  });

  it('a block wall gives both detectors the same contact and lowering', () => {
    const brick = blockId('brick');
    const terrain: Terrain = (x, y) => (x === 0 && y >= 0 && y < 6 ? brick : 0);
    const { world } = worldWith([], terrain);
    // Facing the wall (−x) close enough that the muzzle needs lowering.
    const comparison = compareWalls(world, rifleSample([2.5, 3.2, 0.5], Math.PI / 2, 0), wallTuning(''));
    expect(comparison.modes.cells.lowering.coefficient).toBeGreaterThan(0);
    expect(comparison.gap).toBe(0);
    expect(comparison.modes.refined.lowering.radians).toBe(comparison.modes.cells.lowering.radians);
  });

  it('shape boxes sit where the renderer draws the piece in every pose', () => {
    const meshes = new FurnitureMeshes(s);
    const poses: { facing: Facing; tip?: Tip }[] = [
      ...(['n', 'e', 's', 'w'] as const).map((facing) => ({ facing })),
      { facing: 'e', tip: 'back' },
      { facing: 's', tip: 'left' },
    ];
    for (const type of ['shelf', 'range_table']) {
      for (const { facing, tip } of poses) {
        const { placed } = worldWith([spec(type, [3, 1, -2], facing, tip)]);
        const piece: BlockEntity = placed[0]!;
        const drawn = new Box3().setFromObject(meshes.pieceMesh(piece, furniture(type)));
        const boxes = union(shapeBoxes(piece, furniture(type), s));
        for (let axis = 0; axis < 3; axis++) {
          expect(boxes.min[axis]).toBeCloseTo(drawn.min.getComponent(axis), 5);
          expect(boxes.max[axis]).toBeCloseTo(drawn.max.getComponent(axis), 5);
        }
      }
    }
  });

  it('the mode changes only the detector: one intended pose, and the selected lowering is that mode’s', () => {
    const { world } = worldWith([spec('wood_door', [0, 0, 0])]);
    const sample = rifleSample([0.9, 3.2, 2.8], 0, 0);
    const tuning = wallTuning('');
    const comparison = compareWalls(world, sample, tuning);
    expect(heldFirearmTransform({ ...sample.pose, extraLoweredPitch: 0 })).toEqual(heldFirearmTransform(sample.pose));
    expect(comparison.intended).toEqual(gunProxy(sample, 0, comparison.radius, tuning.reachMetres));
    expect(comparison.modes.cells.lowering.radians).toBeGreaterThan(comparison.modes.refined.lowering.radians);
    // Each mode's lowered gun is the shared proxy at that mode's angle: only the boxes chose the angle.
    for (const mode of ['cells', 'refined'] as const) {
      const { radians, proxy } = comparison.modes[mode].lowering;
      expect(proxy).toEqual(gunProxy(sample, radians, comparison.radius, tuning.reachMetres));
    }
  });

  it('labels geometry refined keeps as cells', () => {
    const chainLink = blockId('chain_link');
    const terrain: Terrain = (x, y, z) => (x === 6 && y === 0 && z === 0 ? chainLink : 0);
    const { world } = worldWith([spec('range_rack', [0, 0, 0])], terrain);
    const vehicleCell: Vec3 = [8, 0, 0];
    const withVehicle: WallWorld = {
      ...world,
      solid: (x, y, z) =>
        world.solid(x, y, z) || (x === vehicleCell[0] && y === vehicleCell[1] && z === vehicleCell[2]),
    };
    const labels = new Set(
      gatherWallBoxes(withVehicle, 'refined', [-1, -1, -1], [10, 5, 3]).flatMap((box) =>
        box.unrefined ? [box.unrefined] : [],
      ),
    );
    expect([...labels].some((label) => label.includes('range_rack'))).toBe(true);
    expect([...labels].some((label) => label.includes(registry.blocks[chainLink]!.name))).toBe(true);
    expect(labels.has('vehicle')).toBe(true);
    expect(gatherWallBoxes(withVehicle, 'cells', [-1, -1, -1], [10, 5, 3]).some((box) => box.unrefined)).toBe(false);
  });
});
