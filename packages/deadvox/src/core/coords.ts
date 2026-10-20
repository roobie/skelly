// World and chunk coordinates. Blocks are 1 unit; +y is up.
// Chunks are cubes of CHUNK³ blocks, stored y-major: index = x + CHUNK * (z + CHUNK * y).

export type Vec3 = [number, number, number];

/** Canonical map compass convention: north is −z; with +y up, east is +x. */
const WORLD_NORTH: Readonly<Vec3> = [0, 0, -1];

const FULL_TURN = Math.PI * 2;
const NORTH_YAW = Math.atan2(-WORLD_NORTH[0], -WORLD_NORTH[2]);

/** Converts counterclockwise camera yaw in radians to a clockwise bearing in degrees. */
export const compassBearing = (yaw: number): number =>
  ((((NORTH_YAW - yaw) % FULL_TURN) + FULL_TURN) % FULL_TURN) * (180 / Math.PI);

/** Converts clockwise degrees from world north to the equivalent counterclockwise camera yaw. */
export const yawFromBearing = (bearing: number): number => {
  const yaw = NORTH_YAW - (bearing * Math.PI) / 180;
  return ((((yaw + Math.PI) % FULL_TURN) + FULL_TURN) % FULL_TURN) - Math.PI;
};

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Labels a heading with its rounded 000–359 degree value and nearest compass point. */
export const headingLabel = (bearing: number): { degrees: number; cardinal: (typeof DIRECTIONS)[number] } => {
  const degrees = Math.round(((bearing % 360) + 360) % 360) % 360;
  return { degrees, cardinal: DIRECTIONS[Math.round(degrees / 45) % DIRECTIONS.length]! };
};

const CHUNK_BITS = 5;
export const CHUNK = 1 << CHUNK_BITS;
export const CHUNK_VOLUME = CHUNK * CHUNK * CHUNK;

/** Chunk coordinate of an integer block coordinate (floors negatives correctly). */
export const toChunk = (n: number): number => n >> CHUNK_BITS;

/** Position of an integer block coordinate inside its chunk, 0..CHUNK-1. */
export const toLocal = (n: number): number => n & (CHUNK - 1);

export const localIndex = (x: number, y: number, z: number): number => x + CHUNK * (z + CHUNK * y);

export const chunkKey = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;
