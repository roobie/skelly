import { type AimFrame, aimBasis } from './aim.ts';
import type { Vec3 } from './coords.ts';
import { Rng } from './random.ts';
import type { ItemDef } from './schema.ts';

export interface PelletShot {
  /** Eye-origin hitscan rays in simulation blocks; no flight/penetration simulation. */
  readonly origin: Vec3;
  readonly directions: readonly Vec3[];
  readonly diameterMm: number;
  readonly damage: number;
  readonly impulse: number;
  readonly rangeMetres: number;
}

/** Gameplay estimates, not measured choke patterns or physical wound/energy models. */
export const BUCK_HALF_ANGLE = (2 * Math.PI) / 180;
const BUCK_RANGE_METRES = 50;

/** Uniform area sample in a forward cone's tangent-plane disk. */
export const coneDirection = (basis: ReturnType<typeof aimBasis>, halfAngleRadians: number, rng: Rng): Vec3 => {
  if (!Number.isFinite(halfAngleRadians) || halfAngleRadians < 0 || halfAngleRadians >= Math.PI / 2) {
    throw new Error('Invalid dispersion cone');
  }
  if (halfAngleRadians === 0) {
    return [...basis.forward];
  }
  const radius = Math.sqrt(rng.next()) * Math.tan(halfAngleRadians);
  const angle = rng.next() * Math.PI * 2;
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);
  const vector: Vec3 = basis.forward.map(
    (value, index) => value + basis.right[index]! * x + basis.up[index]! * y,
  ) as Vec3;
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length) as Vec3;
};

export const pelletShot = ({
  ammo,
  origin,
  yaw,
  pitch,
  aimFrame,
  seed,
  key,
}: {
  ammo: NonNullable<ItemDef['ammo']>;
  origin: Vec3;
  yaw: number;
  pitch: number;
  aimFrame: AimFrame;
  seed: number;
  key: string;
}): PelletShot => {
  const rng = Rng.stream(seed, `buckshot:${key}`);
  const { forward, right, up } = aimBasis(yaw, pitch, aimFrame);
  const basis = { forward, right, up };
  const directions = Array.from({ length: ammo.pellets }, (): Vec3 => coneDirection(basis, BUCK_HALF_ANGLE, rng));
  return {
    origin: [...origin],
    directions,
    diameterMm: ammo.diameterMm,
    // Diameter-scaled game balance: 20 region HP and 0.35 N·s per nominal 00 pellet. Not ballistics.
    damage: 20 * (ammo.diameterMm / 8.38) ** 3,
    impulse: 0.35 * (ammo.diameterMm / 8.38) ** 3,
    rangeMetres: BUCK_RANGE_METRES,
  };
};
