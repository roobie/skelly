import type { Vec3 } from './coords.ts';

export interface AcidGlobState {
  source: number;
  type: string;
  move: string;
  pos: Vec3;
  velocity: Vec3;
  damage: number;
  puddleDamagePerSimSecond: number;
  regionRoll: number;
}

export interface AcidGlobContact {
  distance: number;
}

/** Sweeps short chords of the ballistic arc; a fast glob cannot skip a body or a voxel. */
export const advanceAcidGlob = <T extends AcidGlobContact>(
  glob: AcidGlobState,
  dt: number,
  gravity: number,
  cast: (origin: Vec3, direction: Vec3, distance: number) => T | undefined,
): { contact: T; position: Vec3 } | undefined => {
  let remaining = dt;
  while (remaining > 0) {
    // Bound both travel and curvature in block units, independently of content speed and acceleration.
    const step = Math.min(remaining, 0.25 / Math.max(1, Math.hypot(...glob.velocity)), Math.sqrt(0.25 / gravity));
    const delta: Vec3 = [
      glob.velocity[0] * step,
      glob.velocity[1] * step - 0.5 * gravity * step * step,
      glob.velocity[2] * step,
    ];
    const distance = Math.hypot(...delta);
    if (distance > 0) {
      const direction: Vec3 = [delta[0] / distance, delta[1] / distance, delta[2] / distance];
      const contact = cast(glob.pos, direction, distance);
      if (contact) {
        const position: Vec3 = [
          glob.pos[0] + direction[0] * contact.distance,
          glob.pos[1] + direction[1] * contact.distance,
          glob.pos[2] + direction[2] * contact.distance,
        ];
        glob.pos = position;
        return { contact, position };
      }
    }
    glob.pos = [glob.pos[0] + delta[0], glob.pos[1] + delta[1], glob.pos[2] + delta[2]];
    glob.velocity[1] -= gravity * step;
    remaining = Math.max(0, remaining - step);
  }
  return undefined;
};
