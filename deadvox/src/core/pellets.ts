import { type AimBasis, type AimFrame, aimBasis } from './aim.ts';
import type { Vec3 } from './coords.ts';
import { Rng } from './random.ts';
import type { ItemDef } from './schema.ts';

/** One hitscan ray per projectile: each of a shell's pellets, or a rifle's single bullet. */
export interface PelletShot {
  /** Muzzle-origin hitscan rays in simulation blocks; no flight/penetration simulation. */
  readonly origin: Vec3;
  readonly directions: readonly Vec3[];
  readonly diameterMm: number;
  /** Per projectile, from the cartridge's `ammo` content. */
  readonly damage: number;
  readonly impulse: number;
  readonly rangeMetres: number;
  readonly headDamageMultiplier?: number;
}

/** Gameplay estimates, not measured choke patterns or physical wound/energy models. */
export const BUCK_HALF_ANGLE = (2 * Math.PI) / 180;

/** The cartridge's projectile data along `directions`; each direction is copied, so the shot owns its rays. */
export const projectileShot = (
  ammo: NonNullable<ItemDef['ammo']>,
  origin: Vec3,
  directions: readonly Vec3[],
): PelletShot => ({
  origin: [...origin],
  directions: directions.map((direction): Vec3 => [...direction]),
  diameterMm: ammo.diameterMm,
  damage: ammo.damage,
  impulse: ammo.impulse,
  rangeMetres: ammo.rangeMetres,
  ...(ammo.headDamageMultiplier === undefined ? {} : { headDamageMultiplier: ammo.headDamageMultiplier }),
});

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

export const pelletShotFromBasis = ({
  ammo,
  origin,
  basis,
  seed,
  key,
}: {
  ammo: NonNullable<ItemDef['ammo']>;
  origin: Vec3;
  basis: AimBasis;
  seed: number;
  key: string;
}): PelletShot => {
  const rng = Rng.stream(seed, `buckshot:${key}`);
  const directions = Array.from({ length: ammo.pellets }, (): Vec3 => coneDirection(basis, BUCK_HALF_ANGLE, rng));
  return projectileShot(ammo, origin, directions);
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
}): PelletShot => pelletShotFromBasis({ ammo, origin, basis: aimBasis(yaw, pitch, aimFrame), seed, key });
