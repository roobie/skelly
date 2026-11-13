// The parked-vehicle determinism fixture: one off-grid panel part queried through the production Rapier seam
// (`src/core/rapier.ts`). A browser page runs it with the bundler's asset URL; Node and Vitest hosts read the
// vendored bytes and pass them. Every probe answer crosses the WASM boundary, so cross-engine equality of the
// encoded replay is the f64 build's determinism gate.

import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import { type Body, type BodyShape, stepBody } from '@skelly/engine/internal/core/physics.ts';
import { awaitRapier, ColliderDesc, Cuboid, Ray, RigidBodyDesc, World } from '../../src/core/rapier.ts';

export const initializeVehicleReplay = (wasm?: Uint8Array): ReturnType<typeof awaitRapier> => awaitRapier(wasm);

const panelMin: Vec3 = [0.8, 0, 0];
const panelMax: Vec3 = [0.9, 2, 3];
const span: Vec3 = [panelMax[0] - panelMin[0], panelMax[1] - panelMin[1], panelMax[2] - panelMin[2]];
const half: Vec3 = [span[0] / 2, span[1] / 2, span[2] / 2];
const panelCentre: Vec3 = [panelMin[0] + half[0]!, panelMin[1] + half[1]!, panelMin[2] + half[2]!];

/** Directions use only + - * / and sqrt, which every engine rounds the same way. */
const toward = (from: Vec3, to: Vec3): Vec3 => {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  return [d[0] / length, d[1] / length, d[2] / length];
};

const at = (u: number, v: number, w: number): Vec3 => [
  panelMin[0] + span[0] * u,
  panelMin[1] + span[1] * v,
  panelMin[2] + span[2] * w,
];

const corner = (high: number): Vec3 => [
  high & 1 ? panelMax[0] : panelMin[0],
  high & 2 ? panelMax[1] : panelMin[1],
  high & 4 ? panelMax[2] : panelMin[2],
];

const vector = (p: Vec3) => ({ x: p[0]!, y: p[1]!, z: p[2]! });

export interface PanelReplay {
  rays: ({ timeOfImpact: number; normal: Vec3 } | null)[];
  rayHits: number;
  rayMisses: number;
  points: { isInside: boolean; point: Vec3 }[];
  overlaps: boolean[];
  flush: boolean[];
  poses: Vec3[];
  contactFrames: number;
  drop: { position: Vec3; velocity: Vec3 }[];
  rapierFloats: number;
}

/** Oblique rays, straddling point projections, box overlaps, a sliding body and a solver-driven drop. */
export const replayPanelQueries = (): PanelReplay => {
  const world = new World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  try {
    world.createCollider(ColliderDesc.cuboid(half[0]!, half[1]!, half[2]!).setTranslation(...panelCentre));
    // Rapier's query pipelines update on step, so the world advances once before probing.
    world.step();

    const fractions = [0.0937, 0.3121, 0.5713, 0.8329];
    const oblique = fractions.flatMap((u, i) =>
      fractions.map((v, j): { from: Vec3; direction: Vec3 } => {
        const from: Vec3 = [
          panelMin[0] - 0.4137 - u * 0.3,
          panelMin[1] + span[1] * (v * 1.2 - 0.1),
          panelMin[2] - 0.2371 + (i + j) * 0.2913,
        ];
        return { from, direction: toward(from, at(1.5, v, fractions[(i + j) % 4]!)) };
      }),
    );
    // Rays leaving the solid always miss, so the miss path stays covered whatever the shapes do.
    const misses: { from: Vec3; direction: Vec3 }[] = [
      { from: at(-0.5, 0.4137, 0.5713), direction: [-1, 0, 0] },
      { from: at(1.5, 0.85, 0.5), direction: [0, 1, 0] },
    ];
    const cast = ({ from, direction }: { from: Vec3; direction: Vec3 }) =>
      world.castRayAndGetNormal(new Ray(vector(from), vector(direction)), 40, true);
    const rays = [...oblique.map(cast), ...misses.map(cast)];
    const rayHits = rays.filter((hit) => hit !== null).length;

    const nudges = [-1e-6, -1e-9, 0, 1e-9, 1e-6];
    const faces: Vec3[] = [];
    for (const axis of [0, 1, 2] as const) {
      for (const bound of [panelMin[axis]!, panelMax[axis]!]) {
        for (const nudge of nudges) {
          const point = at(0.4187, 0.5233, 0.6149);
          point[axis] = bound + nudge;
          faces.push(point);
        }
      }
    }
    const edges = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) =>
      nudges.map((n): Vec3 => corner(c).map((x, a) => x + ((c >> a) & 1 ? -n : n)) as Vec3),
    );
    const projection = (point: Vec3) => {
      const found = world.projectPoint(vector(point), true);
      return found === null
        ? { isInside: false, point }
        : { isInside: found.isInside, point: [found.point.x, found.point.y, found.point.z] as Vec3 };
    };
    const points = faces.map(projection);
    const overlapsBox = (centre: Vec3, extent: number) => {
      let overlapping = false;
      world.intersectionsWithShape(
        vector(centre),
        { x: 0, y: 0, z: 0, w: 1 },
        new Cuboid(extent, extent, extent),
        () => {
          overlapping = true;
          return false;
        },
      );
      return overlapping;
    };
    const boxHalf = 0.1317;
    const overlaps = [...faces, ...edges].map((centre) => overlapsBox(centre, boxHalf));
    const flush = faces.map((centre) => overlapsBox(centre, 1e-7));

    // The body carries its exact shape backed by Rapier box tests, so its slide's contact answers cross the
    // WASM boundary; the free twin never touches the panel and counts the contact frames.
    const shapeOf = (shaped: Body): BodyShape => {
      const halfX = shaped.halfWidth;
      const halfZ = shaped.halfDepth ?? shaped.halfWidth;
      const overlapsTerrainUpTo = (pos: Vec3, height: number): boolean => {
        let hit = false;
        world.intersectionsWithShape(
          { x: pos[0]!, y: pos[1]! + height / 2, z: pos[2]! },
          { x: 0, y: 0, z: 0, w: 1 },
          new Cuboid(halfX, height / 2, halfZ),
          () => {
            hit = true;
            return false;
          },
        );
        return hit;
      };
      return {
        overlapsTerrain: (pos: Vec3) => overlapsTerrainUpTo(pos, shaped.height),
        overlapsTerrainBelow: (pos: Vec3, height: number) => overlapsTerrainUpTo(pos, Math.min(height, shaped.height)),
        overlapsBox: (pos: Vec3, min: Vec3, max: Vec3) => {
          const lo: Vec3 = [pos[0]! - halfX, pos[1]!, pos[2]! - halfZ];
          const hi: Vec3 = [pos[0]! + halfX, pos[1]! + shaped.height, pos[2]! + halfZ];
          return [0, 1, 2].every((axis) => lo[axis]! < max[axis]! && hi[axis]! > min[axis]!);
        },
      };
    };
    const body: Body = {
      pos: [panelMin[0] - 0.5731, panelMin[1], panelMin[2] + span[2] * 0.2113],
      vel: [1.1, 0, 0.7],
      halfWidth: 0.1,
      height: Math.min(1, span[1] || 1),
      onGround: false,
    };
    const free: Body = { ...body, pos: [...body.pos], vel: [...body.vel] };
    const poses: Vec3[] = [];
    let contactFrames = 0;
    for (let frame = 0; frame < 180; frame++) {
      stepBody(body, 1 / 60, () => false, { gravity: 0, stepHeight: 0, shapeOf });
      stepBody(free, 1 / 60, () => false, { gravity: 0, stepHeight: 0 });
      poses.push([...body.pos]);
      contactFrames += body.pos.some((v, axis) => v !== free.pos[axis]) ? 1 : 0;
    }

    // The solver itself drives a dropped ball, recording every step's floats.
    const ball = world.createRigidBody(RigidBodyDesc.dynamic().setTranslation(0.847, 2.31, 0.913).setCanSleep(false));
    world.createCollider(ColliderDesc.ball(0.1317), ball);
    const drop: { position: Vec3; velocity: Vec3 }[] = [];
    for (let frame = 0; frame < 120; frame++) {
      world.step();
      const p = ball.translation();
      const v = ball.linvel();
      drop.push({
        position: [p.x, p.y, p.z],
        velocity: [v.x, v.y, v.z],
      });
    }

    return {
      rays: rays.map((hit) =>
        hit === null ? null : { timeOfImpact: hit.timeOfImpact, normal: [hit.normal.x, hit.normal.y, hit.normal.z] },
      ),
      rayHits,
      rayMisses: rays.length - rayHits,
      points,
      overlaps,
      flush,
      poses,
      contactFrames,
      drop,
      rapierFloats: rayHits * 4,
    };
  } finally {
    world.free();
  }
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
