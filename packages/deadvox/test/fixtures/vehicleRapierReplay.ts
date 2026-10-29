import deterministic from '@dimforge/rapier3d-deterministic-compat';
import { VehicleQuerySeam } from '../../src/bench/vehicleQuerySeam.ts';
import {
  type ColliderTier,
  type ModelShapes,
  type PartSnapshot,
  VehicleRapierQueries,
} from '../../src/bench/vehicleRapier.ts';
import { convexPieces, placeMesh, readGlbMesh } from '../../src/bench/vehicleShapes.ts';
import type { Vec3 } from '../../src/core/coords.ts';
import { steppedItemFlight } from '../../src/core/itemThrow.ts';
import { type Body, stepBody } from '../../src/core/physics.ts';

export const panelSnapshot: PartSnapshot = {
  version: 0,
  parts: [{ key: 'parked/panel', boxes: [{ min: [0.8, 0, 0], max: [0.9, 2, 3] }] }],
};
export const panelCells = (x: number, y: number, z: number): boolean => x === 0 && y >= 0 && y < 2 && z >= 0 && z < 3;
export const panelBody = (): Body => ({
  pos: [0.25, 0, -0.5],
  vel: [0, 0, 1],
  halfWidth: 0.1,
  height: 1,
  onGround: false,
});
export const panelFlight = (hitsPoint?: (p: Vec3) => boolean) =>
  steppedItemFlight({
    from: [0.25, 1, -0.5],
    direction: [0, 0, 1],
    distanceMetres: 4,
    gravityMetresPerSimSecondSquared: 1,
    flightSimSeconds: 1,
    drag: 0,
    blockSize: 1,
    minY: -1,
    isSolid: panelCells,
    ...(hitsPoint ? { hitsPoint } : {}),
  });

let initialization: Promise<void> | undefined;
export const initializeVehicleReplay = (): Promise<void> => {
  initialization ??= deterministic.init();
  return initialization;
};

type Box = readonly [Vec3, Vec3];

/** Directions use only + - * / and sqrt, which every engine rounds the same way. */
const toward = (from: Vec3, to: Vec3): Vec3 => {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  return [d[0] / length, d[1] / length, d[2] / length];
};

/** Off-grid probes around a solid's bounds: oblique rays, queries straddling faces and edges, and a sliding body. */
const probe = (queries: VehicleRapierQueries, [min, max]: Box) => {
  const seam = new VehicleQuerySeam(queries, () => false, 0.5);
  const span: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const at = (u: number, v: number, w: number): Vec3 => [
    min[0] + span[0] * u,
    min[1] + span[1] * v,
    min[2] + span[2] * w,
  ];
  const fractions = [0.0937, 0.3121, 0.5713, 0.8329];
  const rays = fractions.flatMap((u, i) =>
    fractions.map((v, j) => {
      const from = at(-0.4137 - u * 0.3, v * 1.2 - 0.1, -0.2371 + (i + j) * 0.2913);
      const direction = toward(from, at(0.5 + u * 0.1, v, fractions[(i + j) % 4]!));
      return queries.rayHit(from, direction, 40 + span[0]);
    }),
  );
  const nudges = [-1e-6, -1e-9, 0, 1e-9, 1e-6];
  const faces: Vec3[] = [];
  for (const axis of [0, 1, 2]) {
    for (const bound of [min[axis]!, max[axis]!]) {
      for (const nudge of nudges) {
        const point = at(0.4187, 0.5233, 0.6149);
        point[axis] = bound + nudge;
        faces.push(point);
      }
    }
  }
  const corner = (high: number): Vec3 => [
    high & 1 ? max[0] : min[0],
    high & 2 ? max[1] : min[1],
    high & 4 ? max[2] : min[2],
  ];
  const edges = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) =>
    nudges.map((n): Vec3 => corner(c).map((x, a) => x + ((c >> a) & 1 ? -n : n)) as Vec3),
  );
  const half = 0.1317;
  const overlaps = [...faces, ...edges].map((centre) =>
    queries.overlapsBox(centre.map((x) => x - half) as Vec3, centre.map((x) => x + half) as Vec3),
  );
  const flush = faces.map((centre) =>
    queries.overlapsBox(centre.map((x) => x - 1e-7) as Vec3, centre.map((x) => x + 1e-7) as Vec3),
  );
  const body: Body = {
    pos: [min[0] - 0.5731, min[1], min[2] + span[2] * 0.2113],
    vel: [1.1, 0, 0.7],
    halfWidth: 0.1,
    height: Math.min(1, span[1] || 1),
    onGround: false,
  };
  const poses: Vec3[] = [];
  for (let frame = 0; frame < 180; frame++) {
    stepBody(body, 1 / 60, seam.terrain, { gravity: 0, stepHeight: 0, shapeOf: seam.shapeOf });
    poses.push([...body.pos]);
  }
  return {
    rays,
    points: faces.map((p) => queries.point(p)),
    overlaps,
    flush,
    poses,
    rapierFloats: rays.reduce((n, hit) => n + (hit ? 4 : 0), 0),
  };
};

const boundsOf = (positions: Float32Array): Box => {
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3]!, positions[i]!);
    max[i % 3] = Math.max(max[i % 3]!, positions[i]!);
  }
  return [min, max];
};

/** The panel, plus when `model` bytes are given a real exported part standing off-grid beside it. */
export const replayVehicleQueries = (rapier: typeof deterministic = deterministic, model?: Uint8Array) => {
  const shapes: ModelShapes | undefined =
    model &&
    (() => {
      const mesh = readGlbMesh(model);
      return { mesh, convex: convexPieces(mesh) };
    })();
  const offset: Vec3 = [3.3719, 0.1303, -0.7117];
  const place = (point: Vec3): Vec3 => [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]];
  const placed = shapes && placeMesh(shapes.mesh, place, false);
  const partBounds = placed && boundsOf(placed.positions);
  const snapshot: PartSnapshot = {
    version: 0,
    parts: [
      ...panelSnapshot.parts,
      ...(shapes && placed && partBounds
        ? [
            {
              key: 'parked/part',
              boxes: [{ min: partBounds[0], max: partBounds[1] }],
              shape: {
                signature: 'part',
                pieces: shapes.convex.pieces.map(
                  (points) => placeMesh({ positions: points, indices: new Uint32Array() }, place, false).positions,
                ),
                mesh: placed,
              },
            },
          ]
        : []),
    ],
  };
  const tiers: ColliderTier[] = shapes ? ['boxes', 'hulls', 'mesh'] : ['boxes'];
  return Object.fromEntries(
    tiers.map((tier) => {
      const queries = new VehicleRapierQueries(rapier, tier);
      try {
        queries.sync(snapshot);
        const seam = new VehicleQuerySeam(queries, (_x, y) => y < 0, 1);
        const actor = panelBody();
        const poses: Vec3[] = [];
        for (let frame = 0; frame < 180; frame++) {
          stepBody(actor, 1 / 60, seam.terrain, { gravity: 9.8, stepHeight: 0, shapeOf: seam.shapeOf });
          poses.push([...actor.pos]);
        }
        const panel = probe(queries, [
          snapshot.parts[0]!.boxes[0]!.min as Vec3,
          snapshot.parts[0]!.boxes[0]!.max as Vec3,
        ]);
        return [
          tier,
          {
            poses,
            flight: panelFlight(seam.point),
            rays: [0.25, 0.85].map((x) => seam.ray([x, 1, -1], [0, 0, 1], 5)),
            panel,
            ...(partBounds ? { part: probe(queries, partBounds) } : {}),
            counts: queries.counts(),
          },
        ];
      } finally {
        queries.free();
      }
    }),
  );
};

export interface ReplayValue {
  path: string;
  value: string;
}

/** Preserve IEEE-754 bits (including signed zero) and absent values across Playwright's JSON boundary. */
export const encodeReplay = (output: unknown): ReplayValue[] => {
  const result: ReplayValue[] = [];
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'number') {
      view.setFloat64(0, value, false);
      result.push({ path, value: `f64:${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}` });
    } else if (Array.isArray(value)) {
      result.push({ path, value: `array:${value.length}` });
      value.forEach((entry, index) => {
        visit(entry, `${path}[${index}]`);
      });
    } else if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value);
      result.push({ path, value: `object:${JSON.stringify(entries.map(([key]) => key))}` });
      for (const [key, entry] of entries) {
        visit(entry, `${path}.${key}`);
      }
    } else {
      result.push({ path, value: `${typeof value}:${String(value)}` });
    }
  };
  visit(output, '$');
  return result;
};
