import {
  boxFromMinMax,
  distanceWorld,
  localSolidBounds,
  penetrationWorld,
  worldSolid,
} from '@skelly/engine/core/geometry.ts';
import { exportGlb, partNodeName } from '@skelly/engine/core/glb.ts';
import { applyDir, type ExtrusionAxis, mulMM, rotX, rotY, rotZ } from '@skelly/engine/core/math.ts';
import { meshForSolid, type TriangleMesh } from '@skelly/engine/core/mesh.ts';
import { type Resolved, resolve } from '@skelly/engine/core/resolve.ts';
import { connectionContact, keepOut as keepOutRule } from '@skelly/engine/core/rules.ts';
import type { Domain, ExtrudedPolygonSolid, KeepOut, PartDef } from '@skelly/engine/core/schema.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import validator from 'gltf-validator';
import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { GUN_PALETTE } from '../src/gun/palette.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { readGlb } from './glbReader.ts';
import { loadFixture } from './helpers.ts';

const profile = [
  [-1, -2],
  [1, -2],
  [1, 2],
  [-1, 2],
] as const;
const range = [-3, 3] as const;
const prism = (axis: ExtrusionAxis): ExtrudedPolygonSolid => ({
  id: `prism-${axis}`,
  kind: 'extruded-polygon',
  profile,
  z: range,
  axis,
});

const meshBounds = (positions: Float32Array): readonly [readonly number[], readonly number[]] => {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, positions[i + axis]!);
      max[axis] = Math.max(max[axis]!, positions[i + axis]!);
    }
  }
  return [min, max];
};

const meshVolume = (mesh: TriangleMesh): number => {
  let volume = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const point = (vertex: number) => [
      mesh.positions[vertex * 3]!,
      mesh.positions[vertex * 3 + 1]!,
      mesh.positions[vertex * 3 + 2]!,
    ];
    const [a, b, c] = [point(mesh.indices[i]!), point(mesh.indices[i + 1]!), point(mesh.indices[i + 2]!)];
    volume +=
      (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) +
        a[1]! * (b[2]! * c[0]! - b[0]! * c[2]!) +
        a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) /
      6;
  }
  return Math.abs(volume);
};

describe('extruded polygon axes', () => {
  it.each([
    ['x', [-3, -1, -2], [3, 1, 2]],
    ['y', [-2, -3, -1], [2, 3, 1]],
    ['z', [-1, -2, -3], [1, 2, 3]],
  ] as const)('builds a right-handed %s-axis prism with invariant bounds and volume', (axis, min, max) => {
    const solid = prism(axis);
    expect(localSolidBounds(solid)).toEqual([min, max]);
    const mesh = meshForSolid(solid, 0);
    expect(meshBounds(mesh.positions)).toEqual([min, max]);
    expect(meshVolume(mesh)).toBeCloseTo(48, 6);
    const unrounded = meshForSolid({ ...solid, display: { bevel: false, outline: false } });
    expect(meshBounds(unrounded.positions)).toEqual([min, max]);
  });

  it('keeps penetration and contact results invariant under a common rotation for X, Y and Z prisms', () => {
    const rotation = mulMM(mulMM(rotX(23), rotY(-31)), rotZ(17));
    const results = (axis: ExtrusionAxis) => {
      const direction = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis];
      const transform = (distance: number) => ({
        r: rotation,
        t: applyDir(
          { r: rotation, t: [0, 0, 0] },
          direction.map((component) => component * distance) as [number, number, number],
        ),
      });
      const first = worldSolid({ r: rotation, t: [0, 0, 0] }, prism(axis));
      const overlap = worldSolid(transform(5), prism(axis));
      const touching = worldSolid(transform(6), prism(axis));
      return [
        penetrationWorld(first, overlap),
        distanceWorld(first, overlap),
        penetrationWorld(first, touching),
        distanceWorld(first, touching),
      ];
    };
    const expected = results('z');
    expect(expected[0]).toBeCloseTo(1);
    expect(expected[1]).toBeCloseTo(0);
    expect(expected[2]).toBeCloseTo(0);
    expect(expected[3]).toBeCloseTo(0);
    for (const result of [results('x'), results('y')]) {
      for (let index = 0; index < result.length; index++) {
        expect(result[index]).toBeCloseTo(expected[index]!);
      }
    }

    const contactIssues = (axis: ExtrusionAxis, distance: number) => {
      const direction = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis];
      const placed = new Map([
        ['a', { r: rotation, t: [0, 0, 0] as const }],
        [
          'b',
          {
            r: rotation,
            t: applyDir(
              { r: rotation, t: [0, 0, 0] },
              direction.map((component) => component * distance) as [number, number, number],
            ),
          },
        ],
      ]);
      const part = (id: string): PartDef => ({
        family: id,
        solids: [prism(axis)],
        ports: [],
        keepOuts: [],
        axes: [],
      });
      const resolved = {
        domain: gunDomain,
        placed,
        defs: new Map([
          ['a', part('a')],
          ['b', part('b')],
        ]),
        connections: [{ from: { part: 'a' }, to: { part: 'b' }, conn: { from: 'a.mate', to: 'b.mate' } }],
      } as unknown as Resolved;
      return connectionContact.check(resolved).map(({ rule, message }) => ({ rule, message }));
    };
    for (const distance of [6, 6.5]) {
      expect(contactIssues('x', distance)).toEqual(contactIssues('z', distance));
      expect(contactIssues('y', distance)).toEqual(contactIssues('z', distance));
    }
    expect(contactIssues('z', 6)).toEqual([]);
    expect(contactIssues('z', 6.5)).toHaveLength(1);

    const keepOutIssues = (axis: ExtrusionAxis, distance: number) => {
      const direction = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis];
      const bounds = localSolidBounds(prism(axis));
      const exactKeepOut: KeepOut = {
        id: 'profile-volume',
        kind: 'test',
        box: boxFromMinMax(bounds[0], bounds[1]),
        profile,
        z: range,
        axis,
      };
      const intruderTransform = {
        r: rotation,
        t: applyDir(
          { r: rotation, t: [0, 0, 0] },
          direction.map((component) => component * distance) as [number, number, number],
        ),
      };
      const owner: PartDef = { family: 'owner', solids: [], ports: [], keepOuts: [exactKeepOut], axes: [] };
      const intruder: PartDef = { family: 'intruder', solids: [prism(axis)], ports: [], keepOuts: [], axes: [] };
      const resolved = {
        placed: new Map([
          ['owner', { r: rotation, t: [0, 0, 0] as const }],
          ['intruder', intruderTransform],
        ]),
        defs: new Map([
          ['owner', owner],
          ['intruder', intruder],
        ]),
        connections: [],
      } as unknown as Resolved;
      return keepOutRule.check(resolved).map(({ rule, message }) => ({ rule, message }));
    };
    for (const distance of [0, 7]) {
      expect(keepOutIssues('x', distance)).toEqual(keepOutIssues('z', distance));
      expect(keepOutIssues('y', distance)).toEqual(keepOutIssues('z', distance));
    }
    expect(keepOutIssues('z', 0)).toHaveLength(1);
    expect(keepOutIssues('z', 7)).toEqual([]);
  });

  it('exports an X-axis prism with valid glTF and outward normals', async () => {
    const fixture = loadFixture('archetype-battle-rifle');
    const grip = gunDomain.families.grip!;
    const axisPrism: ExtrudedPolygonSolid = { ...prism('x'), id: 'body' };
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        grip: {
          ...grip,
          build: (params) => {
            const def = grip.build(params);
            const bounds = localSolidBounds(axisPrism);
            return {
              ...def,
              solids: def.solids.map((solid) => (solid.id === 'body' ? axisPrism : solid)),
              keepOuts: [
                ...def.keepOuts,
                {
                  id: 'axis-profile',
                  kind: 'test',
                  box: boxFromMinMax(bounds[0], bounds[1]),
                  profile,
                  z: range,
                  axis: 'x',
                },
              ],
            };
          },
        },
      },
    };
    const resolved = resolve(fixture, domain);
    const layers = buildLayers(validate(fixture, domain), []);
    try {
      const body = layers.solids.children.find((child) =>
        String(child.userData.label).includes('grip (grip) · solid body'),
      );
      expect(body).toBeInstanceOf(Mesh);
      expect(meshBounds((body as Mesh).geometry.getAttribute('position').array as Float32Array)).toEqual([
        [-3, -1, -2],
        [3, 1, 2],
      ]);
      const keepOut = layers.keepOuts.children.find((child) =>
        String(child.userData.label).includes('grip · keep-out axis-profile'),
      );
      expect(keepOut).toBeInstanceOf(Mesh);
      expect(meshBounds((keepOut as Mesh).geometry.getAttribute('position').array as Float32Array)).toEqual([
        [-3, -1, -2],
        [3, 1, 2],
      ]);
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
    const result = exportGlb({
      resolved,
      palette: GUN_PALETTE,
      asset: { id: 'axis-test', file: 'assets/models/axis-test.glb' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`axis prism export failed: ${JSON.stringify(result.error)}`);
    }
    const report = await validator.validateBytes(result.glb, { uri: 'axis-test.glb' });
    expect(report.issues.numErrors).toBe(0);
    expect(report.issues.numWarnings).toBe(0);

    const read = readGlb(result.glb);
    const node = read.json.nodes.find(({ name }) => name === partNodeName('grip', 'grip'))!;
    const primitive = read.json.meshes[node.mesh!]!.primitives.find(({ extras }) => extras?.solid === 'body')!;
    const positions = read.floats(primitive.attributes.POSITION);
    const normals = read.floats(primitive.attributes.NORMAL);
    for (let i = 0; i < positions.length; i += 3) {
      const dot =
        positions[i]! * normals[i]! + positions[i + 1]! * normals[i + 1]! + positions[i + 2]! * normals[i + 2]!;
      expect(dot).toBeGreaterThan(0);
    }
  });
});
