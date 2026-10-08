import type { Vec3 } from '../core/coords.ts';
import { type Body, bodyOverlapsBlock } from '../core/physics.ts';
import { raycast, type SolidAt } from '../core/raycast.ts';
import type { Scale } from '../core/scale.ts';
import { createPlayerBody } from '../game/player.ts';

export interface ShamblerPlacementWorld {
  config: { scale: Scale };
  spawn: { pos: Vec3 };
  groundAt: (xm: number, zm: number) => number;
  isSolid: SolidAt;
  isOpaque: SolidAt;
}

export const bodyIsClear = (body: Body, isSolid: SolidAt): boolean => {
  const halfDepth = body.halfDepth ?? body.halfWidth;
  for (let y = Math.floor(body.pos[1]); y < Math.ceil(body.pos[1] + body.height); y++) {
    for (let z = Math.floor(body.pos[2] - halfDepth); z < Math.ceil(body.pos[2] + halfDepth); z++) {
      for (let x = Math.floor(body.pos[0] - body.halfWidth); x < Math.ceil(body.pos[0] + body.halfWidth); x++) {
        if (isSolid(x, y, z) && bodyOverlapsBlock(body, [x, y, z])) {
          return false;
        }
      }
    }
  }
  return true;
};

const rayIsClear = (from: Body, to: Body, isSolid: SolidAt, blockSize: number): boolean => {
  const origin: Vec3 = [from.pos[0], from.pos[1] + 1.3 / blockSize, from.pos[2]];
  const target: Vec3 = [to.pos[0], to.pos[1] + 1.3 / blockSize, to.pos[2]];
  const direction = target.map((value, axis) => value - origin[axis]!) as Vec3;
  const distance = Math.hypot(...direction);
  if (distance === 0) {
    return false;
  }
  const unit = direction.map((value) => value / distance) as Vec3;
  return raycast(origin, unit, distance, isSolid) === undefined;
};

const placementBody = (
  engine: ShamblerPlacementWorld,
  x: number,
  z: number,
  bodyDimensions: { readonly halfWidth: number; readonly halfDepth?: number; readonly height: number } | undefined,
): Body => {
  const {
    scale,
    scale: { blockSize },
  } = engine.config;
  const body = createPlayerBody(scale, x / blockSize, engine.groundAt(x, z) / blockSize, z / blockSize);
  body.halfWidth = bodyDimensions?.halfWidth ?? 0.28 / blockSize;
  if (bodyDimensions?.halfDepth !== undefined) {
    body.halfDepth = bodyDimensions.halfDepth;
  }
  body.height = bodyDimensions?.height ?? 1.7 / blockSize;
  body.onGround = true;
  return body;
};

/** Finds the same clear player foothold near the hamlet spawn for browser and CPU runs. */
export const findShamblerBenchPlayer = (engine: ShamblerPlacementWorld): Body => {
  const s = engine.config.scale.blockSize;
  const [baseX, , baseZ] = engine.spawn.pos;
  for (let ring = 0; ring <= 12; ring++) {
    const radius = ring * 0.5;
    const attempts = ring === 0 ? 1 : 24;
    for (let i = 0; i < attempts; i++) {
      const angle = (i / attempts) * Math.PI * 2 + ring * 0.13;
      const x = baseX + radius * Math.cos(angle);
      const z = baseZ + radius * Math.sin(angle);
      const body = createPlayerBody(engine.config.scale, x / s, engine.groundAt(x, z) / s, z / s);
      body.onGround = true;
      if (bodyIsClear(body, engine.isSolid)) {
        return body;
      }
    }
  }
  throw new Error('Could not find open terrain near the hamlet spawn for the player.');
};

/** Places N deterministic, non-overlapping bodies in the lit 8–20 m sight ring. */
export const placeShamblerRing = ({
  count,
  seed,
  player,
  engine,
  occupied: existing = [],
  bodyDimensions,
  allowPartial = false,
  minRadiusMetres = 8,
  maxRadiusMetres = 20,
  requireSight = true,
}: {
  count: number;
  seed: number;
  player: Body;
  engine: ShamblerPlacementWorld;
  occupied?: readonly Body[];
  bodyDimensions?: { readonly halfWidth: number; readonly halfDepth?: number; readonly height: number };
  allowPartial?: boolean;
  minRadiusMetres?: number;
  maxRadiusMetres?: number;
  requireSight?: boolean;
}): Vec3[] => {
  const s = engine.config.scale.blockSize;
  const occupied: Body[] = [player, ...existing];
  const positions: Vec3[] = [];
  const fract = (x: number): number => x - Math.floor(x);
  for (let index = 0; index < count; index++) {
    let body: Body | undefined;
    for (let attempt = 0; attempt < 256; attempt++) {
      const key = seed * 12.9898 + index * 78.233 + attempt * 37.719;
      const radius = Math.sqrt(
        minRadiusMetres ** 2 + fract(Math.sin(key) * 43_758.5453) * (maxRadiusMetres ** 2 - minRadiusMetres ** 2),
      );
      const angle = fract(Math.sin(key + 19.19) * 19_349.123) * Math.PI * 2;
      const x = player.pos[0] * s + radius * Math.cos(angle);
      const z = player.pos[2] * s + radius * Math.sin(angle);
      const candidate = placementBody(engine, x, z, bodyDimensions);
      const overlaps = occupied.some(
        (other) =>
          Math.abs(candidate.pos[0] - other.pos[0]) < candidate.halfWidth + other.halfWidth &&
          Math.abs(candidate.pos[2] - other.pos[2]) <
            (candidate.halfDepth ?? candidate.halfWidth) + (other.halfDepth ?? other.halfWidth),
      );
      if (
        overlaps ||
        !bodyIsClear(candidate, engine.isSolid) ||
        (requireSight && !rayIsClear(candidate, player, engine.isOpaque, s))
      ) {
        continue;
      }
      body = candidate;
      break;
    }
    if (!body) {
      if (allowPartial) {
        break;
      }
      throw new Error(`Could not place shambler ${index + 1} in the ${minRadiusMetres}–${maxRadiusMetres} m ring.`);
    }
    positions.push([...body.pos]);
    occupied.push(body);
  }
  return positions;
};
