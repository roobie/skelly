// Straight flights are ordinary solid blocks. Endpoints are centred landing FEET positions.
import type { Vec3 } from './coords.ts';
import type { StairDef } from './schema.ts';

/** The player body in the authored half-metre grid; also encloses the shorter shambler. */
export const STAIR_BODY_HEIGHT = 3.6;
export const STAIR_BODY_HALF_WIDTH = 0.6;
export interface FlightPlan {
  rise: number;
  direction: Vec3;
  /** One tread/landing row, as integer block columns at a given feet height. */
  row: (step: number) => Vec3[];
}

export const planFlight = (stair: StairDef, size: Vec3): FlightPlan | undefined => {
  const [x, y, z] = stair.lower;
  const dx = stair.upper[0] - x;
  const dz = stair.upper[2] - z;
  const rise = stair.upper[1] - y;
  if (
    rise < 1 ||
    !Number.isInteger(rise) ||
    (dx === 0) === (dz === 0) ||
    Math.abs(dx) + Math.abs(dz) !== rise + 1 ||
    stair.width > Math.max(size[0], size[2])
  ) {
    return undefined;
  }
  const direction: Vec3 = [Math.sign(dx), 0, Math.sign(dz)];
  const along = dx === 0 ? z : x;
  const across = dx === 0 ? x : z;
  if (!(Number.isInteger(along) && Number.isInteger(across - stair.width / 2))) {
    return undefined;
  }
  const row = (step: number): Vec3[] =>
    Array.from({ length: stair.width }, (_, i) => {
      const cross = across - stair.width / 2 + i;
      const feet = y + Math.max(0, Math.min(rise, step));
      return dx === 0
        ? [cross, feet, Math.floor(z + direction[2] * (step + 0.5))]
        : [Math.floor(x + direction[0] * (step + 0.5)), feet, cross];
    });
  if (
    [-1, rise + 1]
      .flatMap(row)
      .some(
        ([bx, by, bz]) =>
          bx < 0 || bx >= size[0] || bz < 0 || bz >= size[2] || by < 1 || by + STAIR_BODY_HEIGHT > size[1],
      )
  ) {
    return undefined;
  }
  return { rise, direction, row };
};

/** Build solid wedges and cut only the upper support layer over the treads. Authored ceilings stay intact. */
export const constructFlight = (blocks: Uint16Array, size: Vec3, stair: StairDef, block: number): void => {
  const plan = planFlight(stair, size);
  if (!plan) {
    return; // Validation reports malformed geometry before admitting the source.
  }
  const at = (x: number, y: number, z: number) => x + size[0] * (z + size[2] * y);
  for (let step = -1; step <= plan.rise + 1; step++) {
    for (const [x, feet, z] of plan.row(step)) {
      for (let y = stair.lower[1] - 1; y < feet; y++) {
        blocks[at(x, y, z)] = block;
      }
      if (step > 0 && step < plan.rise) {
        blocks[at(x, stair.upper[1] - 1, z)] = 0;
      }
    }
  }
};
