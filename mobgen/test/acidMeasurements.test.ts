import { expect, it } from 'vitest';
import type { Body, Bone, Feature } from '../src/core/body.ts';
import { add, type Mat3, mulMV, normalize, rotX, type Vec3 } from '../src/core/math.ts';
import { rasterizeFeatures, worldPosition } from '../src/core/voxelize.ts';
import { frameOf } from '../src/mob/acid.ts';
import {
  backAcceptance,
  backStations,
  closestSection,
  fleshInFrame,
  jointAcceptance,
  jointSections,
  type SideCell,
  sectionAcceptance,
  sectionsOf,
  taperAcceptance,
  widestSection,
} from '../src/mob/acidMeasurements.ts';
import { acidTemplate } from '../src/mob/acidTemplate.ts';

const materials: Body['materials'] = {
  skin: { color: [0.5, 0.5, 0.5], emissive: 0 },
  bone: { color: [0.5, 0.5, 0.5], emissive: 0 },
};
const voxelSize = 0.03;
const cellSize = voxelSize / 4;

const sectionFixture = (rot: Mat3, oval: boolean, radii: Vec3 = [0.15, 0.3, 0.09]) => {
  const head = [0, 0.5, 0] as const;
  const tail = add(head, mulMV(rot, [0, 0.6, 0]));
  const bone: Bone = { id: 'fixture', parent: null, head, tail, frame: frameOf(head, tail) };
  const center = add(head, mulMV(rot, [0, 0.3, 0]));
  const body: Body = {
    bones: [bone],
    features: [
      {
        bone: bone.id,
        op: 'add',
        material: 'skin',
        shape: oval ? { kind: 'ellipsoid', center, radii, rot } : { kind: 'box', center, half: radii, round: 0, rot },
      },
    ],
    materials,
  };
  return sectionsOf(fleshInFrame(body, [bone.id], { frame: bone, origin: head }, cellSize));
};

it('local rerasterization preserves full box fill instead of mistaking rotation holes for oval flesh', () => {
  const straight = closestSection(sectionFixture(rotX(0), false), 0.3);
  const pitched = closestSection(sectionFixture(rotX(40), false), 0.3);
  const oval = closestSection(sectionFixture(rotX(40), true), 0.3);
  expect(pitched).toEqual(straight);
  expect(pitched.fill).toBe(1);
  expect(oval.fill).toBeLessThan(pitched.fill);
  expect(oval.aspect).toBeGreaterThan(1);
  expect(oval.width / oval.depth).toBeCloseTo(oval.aspect);
  expect(sectionAcceptance(pitched, acidTemplate.organic).passes).toBe(false);
  expect(sectionAcceptance(oval, acidTemplate.organic).passes).toBe(true);
  const round = closestSection(sectionFixture(rotX(40), true, [0.09, 0.3, 0.09]), 0.3);
  expect(round.fill).toBeLessThanOrEqual(acidTemplate.organic.maximumSectionFill);
  expect(round.aspect).toBeCloseTo(1);
  expect(sectionAcceptance(round, acidTemplate.organic).passes).toBe(false);
});

it('the widest section finds an ellipsoid muscle belly rather than either tapered end', () => {
  const sections = sectionFixture(rotX(40), true);
  const peak = widestSection(sections);
  expect(peak.width).toBeGreaterThan(sections[0]!.width);
  expect(peak.width).toBeGreaterThan(sections.at(-1)!.width);
  expect(peak.y).toBeGreaterThan(sections[0]!.y);
  expect(peak.y).toBeLessThan(sections.at(-1)!.y);
  const limits = acidTemplate.organic;
  const taperLimits = { minimumTaperVoxels: limits.minimumTaperVoxels, peakRange: limits.armPeak };
  expect(taperAcceptance(sections, 0.6, voxelSize, taperLimits).passes).toBe(true);
  expect(taperAcceptance(sectionFixture(rotX(40), false), 0.6, voxelSize, taperLimits).passes).toBe(false);
});

const profileOf = (features: readonly Feature[], lowerZ = 0, upperZ = 0) => {
  const body: Body = {
    bones: [{ id: 'fixture', parent: null, head: [0, -0.3, 0], tail: [0, 0.3, 0] }],
    features,
    materials,
  };
  const voxels = rasterizeFeatures(body, cellSize, 1);
  const [nx, ny] = voxels.dims;
  const cells = new Map<string, SideCell>();
  voxels.owner.forEach((owner, index) => {
    if (!owner) {
      return;
    }
    const [, y, z] = worldPosition(voxels, index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny)));
    cells.set(`${y},${z}`, { y, z });
  });
  return backAcceptance(
    backStations(
      [...cells.values()],
      { cellSize, stationSize: voxelSize },
      { origin: [0, -0.24, lowerZ], direction: [0, 0, 1] },
      { origin: [0, 0.24, upperZ], direction: [0, 0, 1] },
    ),
    voxelSize,
    voxelSize,
  );
};

it('a long low ellipsoid passes the fine-cell back predicate', () => {
  const result = profileOf([
    {
      bone: 'fixture',
      op: 'add',
      material: 'skin',
      shape: { kind: 'ellipsoid', center: [0, 0, 0], radii: [0.12, 0.3, 0.09] },
    },
  ]);
  expect(result.passes).toBe(true);
});

it('a two-voxel stacked-box ledge fails the back step gate', () => {
  const result = profileOf(
    [
      {
        bone: 'fixture',
        op: 'add',
        material: 'skin',
        blend: 0,
        shape: { kind: 'box', center: [0, -0.15, 0], half: [0.12, 0.15, 0.06], round: 0 },
      },
      {
        bone: 'fixture',
        op: 'add',
        material: 'skin',
        blend: 0,
        shape: { kind: 'box', center: [0, 0.15, 2 * voxelSize], half: [0.12, 0.15, 0.06], round: 0 },
      },
    ],
    0,
    2 * voxelSize,
  );
  expect(result.passes).toBe(false);
  expect(result.maximumStep).toBeGreaterThan(voxelSize);
});

it('a flat box back fails the back peak gate', () => {
  const result = profileOf([
    {
      bone: 'fixture',
      op: 'add',
      material: 'skin',
      shape: { kind: 'box', center: [0, 0, 0], half: [0.12, 0.3, 0.06], round: 0 },
    },
  ]);
  expect(result.passes).toBe(false);
  expect(result.peak).toBeLessThan(result.minimumPeak);
});

it('pitched joint slabs share the forward bisector frame and preserve continuous oval flesh', () => {
  const parent: Bone = {
    id: 'parent',
    parent: null,
    head: [0, -0.3, 0],
    tail: [0, 0, 0],
    frame: frameOf([0, -0.3, 0], [0, 0, 0]),
  };
  const tail = mulMV(rotX(-70), [0, 0.3, 0]);
  const child: Bone = { id: 'child', parent: parent.id, head: parent.tail, tail, frame: frameOf(parent.tail, tail) };
  const body: Body = {
    bones: [parent, child],
    materials,
    features: [parent, child].map((bone) => ({
      bone: bone.id,
      op: 'add',
      material: 'skin',
      shape: { kind: 'ellipsoid', center: [0, 0, 0], radii: [0.12, 0.3, 0.06] },
    })),
  };
  const measured = jointSections(body, parent, child, { voxelSize, cellSize });
  expect(measured.before.width).toBeCloseTo(measured.after.width);
  expect(measured.before.depth).toBeCloseTo(measured.after.depth);
  expect(measured.before.y).toBeCloseTo(-voxelSize / 2);
  expect(measured.after.y).toBeCloseTo(voxelSize / 2);
  const expected = normalize(add(parent.frame!.y, child.frame!.y));
  measured.frame.y.forEach((value, axis) => {
    expect(value).toBeCloseTo(expected[axis]!);
  });
});

it('the shared joint frame measures a three-voxel box-width step across the joint', () => {
  const parent: Bone = {
    id: 'parent',
    parent: null,
    head: [0, -0.3, 0],
    tail: [0, 0, 0],
    frame: frameOf([0, -0.3, 0], [0, 0, 0]),
  };
  const child: Bone = {
    id: 'child',
    parent: parent.id,
    head: parent.tail,
    tail: [0, 0.3, 0],
    frame: frameOf([0, 0, 0], [0, 0.3, 0]),
  };
  const body: Body = {
    bones: [parent, child],
    materials,
    features: [
      {
        bone: parent.id,
        op: 'add',
        material: 'skin',
        shape: { kind: 'box', center: [0, -0.15, 0], half: [0.15, 0.15, 0.06], round: 0 },
      },
      {
        bone: child.id,
        op: 'add',
        material: 'skin',
        shape: { kind: 'box', center: [0, 0.15, 0], half: [0.15 + 1.5 * voxelSize, 0.15, 0.06], round: 0 },
      },
    ],
  };
  const measured = jointSections(body, parent, child, { voxelSize, cellSize });
  expect(measured.widthDifference).toBeCloseTo(3 * voxelSize);
  expect(measured.depthDifference).toBeCloseTo(0);
  expect(jointAcceptance(measured, voxelSize, acidTemplate.organic.maximumJointDifferenceVoxels)).toBe(false);
});

it('sideways bone frames retain their signed up axis and a forward flex axis on both sides', () => {
  for (const sign of [-1, 1]) {
    const frame = frameOf([0, 0, 0], [sign, 0, 0]);
    expect(frame.x[1]).toBe(sign);
    expect(frame.z[2]).toBe(-1);
  }
});
