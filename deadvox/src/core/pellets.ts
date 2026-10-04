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
export const BUCK_RANGE_METRES = 50;

export const pelletShot = ({
  ammo,
  origin,
  yaw,
  pitch,
  seed,
  key,
}: {
  ammo: NonNullable<ItemDef['ammo']>;
  origin: Vec3;
  yaw: number;
  pitch: number;
  seed: number;
  key: string;
}): PelletShot => {
  const rng = Rng.stream(seed, `buckshot:${key}`);
  const forward: Vec3 = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up: Vec3 = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
  const directions = Array.from({ length: ammo.pellets }, (): Vec3 => {
    const radius = Math.sqrt(rng.next()) * Math.tan(BUCK_HALF_ANGLE);
    const angle = rng.next() * Math.PI * 2;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const vector: Vec3 = forward.map((value, index) => value + right[index]! * x + up[index]! * y) as Vec3;
    const length = Math.hypot(...vector);
    return vector.map((value) => value / length) as Vec3;
  });
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
