import { inPolygon, type LayoutPoint } from './authoredLayout.ts';
import { layoutHeight, polylineDistance, polylineDistanceAt, rectDistance, smoothstep } from './authoredTerrain.mjs';
import type { Chunk } from './chunk.ts';
import { CHUNK, toChunk } from './coords.ts';
import { simplexNoise2 } from './random.ts';
import type { ContentFile, SiteLayoutDef } from './schema.ts';
import { rectDistance as floorDistance, type Rect } from './site.ts';
import { type Placement, stampPlacement } from './templates.ts';
import { leafLitterAt, stampTrees, TreeIndex, type TreePlacement } from './vegetation.ts';
import type { Surface } from './worldgen.ts';

export interface AuthoredGroundData {
  readonly blockSize: number;
  readonly seed: number;
  readonly topography: NonNullable<ContentFile['siteGeneration']>[number]['topography'];
  readonly layout: Pick<SiteLayoutDef, 'bounds' | 'ground' | 'terrain' | 'water'>;
  readonly tracks: readonly (Pick<SiteLayoutDef['tracks'][number], 'points' | 'width'> & {
    surface: number | undefined;
  })[];
  readonly protectedBuildings: readonly Rect[];
  readonly spawnPoints: readonly [number, number][];
  readonly lots: readonly { rect: Rect; floor: number; key: string }[];
  readonly catalogue: CatalogueFloor | undefined;
}

export function createAuthoredGround(data: AuthoredGroundData) {
  const { blockSize: s, seed, topography, protectedBuildings, layout, spawnPoints, lots, catalogue, tracks } = data;
  type NoiseTrack = AuthoredGroundData['tracks'][number];
  interface NoiseInfluences {
    buildings: Rect[];
    tracks: NoiseTrack[];
    spawns: [number, number][];
  }
  const noiseColumns = new Map<number, Map<number, NoiseInfluences>>();
  const columnSpanMetres = CHUNK * s;
  const addNoiseInfluence = <K extends keyof NoiseInfluences>(
    bounds: Rect,
    kind: K,
    value: NoiseInfluences[K][number],
  ): void => {
    const cx0 = Math.floor(bounds.x0 / columnSpanMetres);
    const cx1 = Math.floor(bounds.x1 / columnSpanMetres);
    const cz0 = Math.floor(bounds.z0 / columnSpanMetres);
    const cz1 = Math.floor(bounds.z1 / columnSpanMetres);
    for (let cx = cx0; cx <= cx1; cx++) {
      let row = noiseColumns.get(cx);
      if (!row) {
        row = new Map();
        noiseColumns.set(cx, row);
      }
      for (let cz = cz0; cz <= cz1; cz++) {
        let column = row.get(cz);
        if (!column) {
          column = { buildings: [], tracks: [], spawns: [] };
          row.set(cz, column);
        }
        (column[kind] as NoiseInfluences[K][number][]).push(value);
      }
    }
  };
  const buildingReach = topography.buildingMarginMetres + s;
  for (const rect of protectedBuildings) {
    addNoiseInfluence(
      {
        x0: rect.x0 - buildingReach,
        x1: rect.x1 + buildingReach,
        z0: rect.z0 - buildingReach,
        z1: rect.z1 + buildingReach,
      },
      'buildings',
      rect,
    );
  }
  const roadReach = topography.roadShoulderMetres + s;
  for (const track of tracks) {
    let x0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let z0 = Number.POSITIVE_INFINITY;
    let z1 = Number.NEGATIVE_INFINITY;
    for (const [x, z] of track.points) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const reach = track.width / 2 + roadReach;
    addNoiseInfluence({ x0: x0 - reach, x1: x1 + reach, z0: z0 - reach, z1: z1 + reach }, 'tracks', track);
  }
  const spawnReach = topography.spawnMarginMetres + s;
  for (const [x, z] of spawnPoints) {
    addNoiseInfluence({ x0: x - spawnReach, x1: x + spawnReach, z0: z - spawnReach, z1: z + spawnReach }, 'spawns', [
      x,
      z,
    ]);
  }
  const buildingWeight = (buildings: readonly Rect[], xm: number, zm: number): number => {
    let weight = 1;
    for (const rect of buildings) {
      const distance = rectDistance(rect, xm, zm, s);
      const candidate =
        topography.buildingMarginMetres === 0
          ? Number(distance > 0)
          : smoothstep(Math.min(1, distance / topography.buildingMarginMetres));
      weight = Math.min(weight, candidate);
      if (weight === 0) {
        return 0;
      }
    }
    return weight;
  };
  const trackWeight = (influences: readonly NoiseTrack[], xm: number, zm: number): number => {
    let weight = 1;
    for (const track of influences) {
      const distance = polylineDistanceAt(xm, zm, track.points) - track.width / 2;
      const candidate =
        topography.roadShoulderMetres === 0
          ? Number(distance > 0)
          : smoothstep(Math.min(1, Math.max(0, distance) / topography.roadShoulderMetres));
      weight = Math.min(weight, candidate);
      if (weight === 0) {
        return 0;
      }
    }
    return weight;
  };
  const spawnWeight = (spawns: readonly [number, number][], xm: number, zm: number): number => {
    let weight = 1;
    for (const [spawnX, spawnZ] of spawns) {
      const distance = Math.hypot(xm - spawnX, zm - spawnZ);
      const candidate =
        topography.spawnMarginMetres === 0
          ? Number(distance > 0)
          : smoothstep(Math.min(1, distance / topography.spawnMarginMetres));
      weight = Math.min(weight, candidate);
      if (weight === 0) {
        return 0;
      }
    }
    return weight;
  };
  const noiseWeight = (x: number, z: number, xm: number, zm: number): number => {
    const column = noiseColumns.get(toChunk(x))?.get(toChunk(z));
    if (!column) {
      return 1;
    }
    return Math.min(
      buildingWeight(column.buildings, xm, zm),
      trackWeight(column.tracks, xm, zm),
      spawnWeight(column.spawns, xm, zm),
    );
  };
  const height = (x: number, z: number, natural: number): number => {
    const xm = (x + 0.5) * s;
    const zm = (z + 0.5) * s;
    const profile = layoutHeight(layout, lots, [xm, zm], natural * s);
    const noise = simplexNoise2(seed + 0x51_7e, xm / topography.wavelengthMetres, zm / topography.wavelengthMetres);
    const ground = Math.round((profile + noise * topography.amplitudeMetres * noiseWeight(x, z, xm, zm)) / s);
    return catalogue ? catalogueHeight(catalogue, x, z, ground) : ground;
  };
  const trackAt = (x: number, z: number) =>
    tracks.find((track) => polylineDistance([(x + 0.5) * s, (z + 0.5) * s], track.points) <= track.width / 2);
  const { water, sandy } = siteWater(layout, s, height);
  return {
    height,
    ...(water && { water }),
    sandy,
    trackAt,
  };
}

export function createAuthoredTerrain(data: {
  readonly ground: ReturnType<typeof createAuthoredGround>;
  readonly catalogue: CatalogueFloor | undefined;
  readonly trees: readonly TreePlacement[];
  readonly litter: number;
  readonly sand: number;
  readonly placements: readonly Placement[];
}) {
  const { ground, catalogue, trees, litter, sand, placements } = data;
  const index = new TreeIndex(trees);
  const surface: Surface = {
    height: ground.height,
    ...(ground.water && { water: ground.water }),
    top: (x, z) => {
      const floor = catalogue && catalogueTop(catalogue, x, z);
      if (floor !== undefined) {
        return floor;
      }
      if (ground.sandy(x, z)) {
        return sand;
      }
      const track = ground.trackAt(x, z);
      if (track) {
        return track.surface;
      }
      return leafLitterAt(index.at(x, z), x, z) ? litter : undefined;
    },
  };
  return {
    surface,
    stamp: (chunk: Chunk): void => {
      stampTrees(chunk, index.inColumn(chunk.cx, chunk.cz));
      for (const placement of placements) {
        stampPlacement(chunk, placement);
      }
    },
  };
}

/** Room for many chunk columns' shore scans, so clearing only repeats work, never inside one column. */
const WET_CACHE_COLUMNS = 64 * CHUNK * CHUNK;

const siteWater = (
  layout: Pick<SiteLayoutDef, 'ground' | 'water'>,
  s: number,
  height: (x: number, z: number, natural: number) => number,
): { water?: Surface['water']; sandy: (x: number, z: number) => boolean } => {
  const rows = (layout.water ?? []).map((row) => {
    const xs = row.polygon.map(([x]) => x);
    const zs = row.polygon.map(([, z]) => z);
    const { shore } = row;
    const reach = {
      x0: Math.min(...xs) - shore,
      x1: Math.max(...xs) + shore,
      z0: Math.min(...zs) - shore,
      z1: Math.max(...zs) + shore,
    };
    return { ...row, reach };
  });
  if (rows.length === 0) {
    return { sandy: () => false };
  }
  // Overlapping bodies fill to the highest level.
  const levelAt = (x: number, z: number): number | undefined => {
    const at: LayoutPoint = [(x + 0.5) * s, (z + 0.5) * s];
    let level: number | undefined;
    for (const { level: rowLevel, polygon } of rows) {
      if ((level === undefined || rowLevel > level) && inPolygon(at, polygon)) {
        level = rowLevel;
      }
    }
    return level;
  };
  const reaches = ({ reach }: (typeof rows)[number], x: number, z: number): boolean => {
    const [xm, zm] = [(x + 0.5) * s, (z + 0.5) * s];
    return xm >= reach.x0 && xm <= reach.x1 && zm >= reach.z0 && zm <= reach.z1;
  };
  // Inside the site bounds `natural` has no weight, and validation keeps water polygons inside them.
  // The shore scan asks each column's neighbours, so answers are cached; the cache is cleared when
  // full because a lake's area has no bound, while the columns being generated at once are few.
  const wetColumns = new Map<string, boolean>();
  const wet = (x: number, z: number): boolean => {
    const key = `${x},${z}`;
    let value = wetColumns.get(key);
    if (value === undefined) {
      const level = levelAt(x, z);
      value = level !== undefined && height(x, z, layout.ground / s) + 1 < level / s;
      if (wetColumns.size >= WET_CACHE_COLUMNS) {
        wetColumns.clear();
      }
      wetColumns.set(key, value);
    }
    return value;
  };
  const onShore = (row: (typeof rows)[number], x: number, z: number): boolean => {
    if (!reaches(row, x, z)) {
      return false;
    }
    const cells = Math.floor(row.shore / s);
    for (let dz = -cells; dz <= cells; dz++) {
      for (let dx = -cells; dx <= cells; dx++) {
        if (Math.hypot(dx, dz) * s <= row.shore && wet(x + dx, z + dz)) {
          return true;
        }
      }
    }
    return false;
  };
  return {
    water: (x, z) => {
      const level = levelAt(x, z);
      return level === undefined ? undefined : level / s;
    },
    // A grass lake bed reads as a hole in a lawn, so the bed and a shore ring around the actual water are sand.
    sandy: (x, z) => rows.some((row) => reaches(row, x, z)) && (wet(x, z) || rows.some((row) => onShore(row, x, z))),
  };
};
export interface CatalogueFloor {
  readonly rect: Rect;
  readonly floor: number;
  readonly blend: number;
  readonly floorBlock: number;
}

export function catalogueHeight(data: CatalogueFloor, x: number, z: number, natural: number): number {
  const distance = floorDistance(data.rect, x, z);
  if (distance >= data.blend) {
    return natural;
  }
  return Math.round(natural + smoothstep(1 - distance / data.blend) * (data.floor - natural));
}

export function catalogueTop(data: CatalogueFloor, x: number, z: number): number | undefined {
  return floorDistance(data.rect, x, z) === 0 ? data.floorBlock : undefined;
}
