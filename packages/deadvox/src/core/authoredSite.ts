// Tiled is build-time only. This Site consumes validated layout JSON and existing ASCII templates.
import { inPolygon, type LayoutPoint } from './authoredLayout.ts';
import { blocks, placementOf } from './authoredPlacement.ts';
import {
  buildingBounds,
  LOT_APRON_M,
  layoutHeight,
  lotOf,
  polylineDistance,
  polylineDistanceAt,
  rectDistance,
  smoothstep,
} from './authoredTerrain.mjs';
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import { CHUNK, toChunk, type Vec3, yawFromBearing } from './coords.ts';
import { type LootSpawnPoint, lootPointsByColumn } from './loot.ts';
import { placementKeyLoot } from './placementLoot.ts';
import type { PublicCartographicFeature } from './publicCartography.ts';
import { Rng, simplexNoise2 } from './random.ts';
import type { Scale } from './scale.ts';
import type { LightPracticeDef, SiteLayoutDef } from './schema.ts';
import { HORDE_MEMBERS, HORDE_TYPE, TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import {
  focusPose,
  propCentre,
  type ShowroomDef,
  type ShowroomProp,
  slotPlacement,
  slotProps,
  yawToward,
} from './showroom.ts';
import {
  furnitureOf,
  grow,
  type HordeSpawn,
  lootSourcesOf,
  type PlaytestMarks,
  type Rect,
  rectsOverlap,
  type Site,
  SupplyFootprints,
  type ZombieSpawn,
} from './site.ts';
import { sitePalette } from './sitePalette.ts';
import { type Placement, placedPieces, placedSpawns, stampPlacement } from './templates.ts';
import {
  forestDensityAt,
  leafLitterAt,
  stampTrees,
  TreeIndex,
  type TreePlacement,
  vegetationPlacements,
} from './vegetation.ts';
import type { Surface } from './worldgen.ts';

/** Room for many chunk columns' shore scans, so clearing only repeats work, never inside one column. */
const WET_CACHE_COLUMNS = 64 * CHUNK * CHUNK;

/**
 * A layout's water rows as a surface's water and its sand: the bed and a shore ring. Without rows
 * there is no `water`, so generation skips the water column.
 */
const siteWater = (
  layout: SiteLayoutDef,
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

export class AuthoredSite implements Site {
  readonly spawn: Site['spawn'];
  readonly surface: Surface;
  readonly placements: readonly Placement[];
  readonly publicCartography: readonly PublicCartographicFeature[];
  get authoredPlacements(): readonly Placement[] {
    return this.placements;
  }
  get trees(): readonly TreePlacement[] {
    return this.treeIndex.trees;
  }
  private readonly spawns: readonly ZombieSpawn[];
  private readonly hordes: readonly HordeSpawn[];
  private treeIndex: TreeIndex;
  private readonly lootColumns: ReadonlyMap<string, readonly LootSpawnPoint[]>;
  private readonly supplyFootprints: SupplyFootprints;
  readonly playtestMarks: PlaytestMarks;
  readonly lightPractice?: LightPracticeDef;
  readonly seed: number;
  readonly registry: Registry;
  readonly showroom: ShowroomDef | undefined;
  /** The showroom's authored props, oldest first. */
  readonly slots: readonly ShowroomProp[];

  constructor(seed: number, registry: Registry, scale: Scale, layout: SiteLayoutDef) {
    this.seed = seed;
    this.registry = registry;
    if (scale.blockSize !== TEMPLATE_BLOCK_SIZE) {
      throw new Error('Authored ASCII sites require 0.5 m blocks');
    }
    const s = scale.blockSize;
    const tuning = registry.siteGeneration.get(CORE_CONTENT_IDS.authoredSite);
    if (!tuning) {
      throw new Error('Missing authored site generation tuning');
    }
    const rectBlocks = (rect: Rect): Rect => ({ x0: rect.x0 / s, x1: rect.x1 / s, z0: rect.z0 / s, z1: rect.z1 / s });
    const area = rectBlocks(layout.bounds);
    const lots = layout.buildings.map((building) => {
      const rect = buildingBounds(building, registry.templates.get(building.template)!.size);
      return { ...lotOf(building, rect), apron: grow(rectBlocks(rect), LOT_APRON_M / s) };
    });
    const slots = slotPlacement(registry, layout);
    this.placements = [
      ...layout.buildings.map((building) => placementOf(registry, building, layout.lootContext)),
      ...(slots ? [slots] : []),
    ];
    this.publicCartography = layout.tracks.map(({ points, width }) => ({ kind: 'track', points, width }));
    this.lootColumns = lootPointsByColumn(
      this.placements.flatMap((placement, i) => {
        const sources = lootSourcesOf(registry, layout.id, placement, layout.buildings[i]?.fixedLoot);
        return layout.demo ? sources.map((source) => ({ ...source, fixture: true as const })) : sources;
      }),
    );
    this.supplyFootprints = new SupplyFootprints(
      this.placements.flatMap(placedPieces),
      [...this.lootColumns.values()].flat(),
    );
    this.playtestMarks = {
      beats: (layout.beats ?? []).map((beat) => ({ id: beat.id, area: rectBlocks(beat.area) })),
      keyLoot: placementKeyLoot(
        this.placements.map((placement, index) => ({
          placement,
          fixedLoot: layout.buildings[index]?.fixedLoot,
        })),
      ),
    };
    if (layout.practice) {
      this.lightPractice = layout.practice.light;
    }
    this.showroom = layout.showroom;
    this.slots = layout.showroom ? slotProps(registry, layout.showroom) : [];
    const newest = this.slots.at(-1);
    this.spawn = {
      pos: [...layout.player.position],
      yaw: newest ? yawToward(layout.player.position, propCentre(newest)) : yawFromBearing(layout.player.bearing),
    };
    const spawnPoints: [number, number][] = [
      [layout.player.position[0], layout.player.position[2]],
      ...layout.shamblers.map((spawn): [number, number] => [spawn.position[0], spawn.position[2]]),
      ...(layout.hordes ?? []).map((horde): [number, number] => [horde.position[0], horde.position[2]]),
      ...this.placements
        .flatMap(placedSpawns)
        .map((marker): [number, number] => [marker.pos[0] * s, marker.pos[2] * s]),
    ];
    const protectedBuildings = layout.buildings.map((building) =>
      buildingBounds(building, registry.templates.get(building.template)!.size),
    );
    type NoiseTrack = SiteLayoutDef['tracks'][number];
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
    const { topography } = tuning;
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
    for (const track of layout.tracks) {
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
    const trackWeight = (tracks: readonly NoiseTrack[], xm: number, zm: number): number => {
      let weight = 1;
      for (const track of tracks) {
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
      const noise = simplexNoise2(
        seed + 0x51_7e,
        xm / tuning.topography.wavelengthMetres,
        zm / tuning.topography.wavelengthMetres,
      );
      return Math.round((profile + noise * tuning.topography.amplitudeMetres * noiseWeight(x, z, xm, zm)) / s);
    };
    const trackAt = (x: number, z: number) =>
      layout.tracks.find((track) => polylineDistance([(x + 0.5) * s, (z + 0.5) * s], track.points) <= track.width / 2);
    const { water, sandy } = siteWater(layout, s, height);
    const player = blocks(layout.player.position);
    const reserved = [
      ...lots.map((lot) => lot.apron),
      { x0: player[0] - 3 / s, x1: player[0] + 3 / s, z0: player[2] - 3 / s, z1: player[2] + 3 / s },
    ];
    const woodlandDensityAt = (x: number, z: number): number => {
      const vegetationTuning = tuning.vegetation;
      const edgeNoise =
        simplexNoise2(
          seed + 0x71_3b,
          x / vegetationTuning.woodlandEdgeWavelengthMetres,
          z / vegetationTuning.woodlandEdgeWavelengthMetres,
        ) *
        vegetationTuning.woodlandEdgeVariation *
        vegetationTuning.woodlandEdgeWavelengthMetres;
      return Math.max(
        0,
        ...layout.woodlands
          .filter((wood) => {
            const closed = [...wood.polygon, wood.polygon[0]!];
            const inside = inPolygon([x, z], wood.polygon);
            const edgeDistance = polylineDistance([x, z], closed);
            return (inside ? edgeDistance : -edgeDistance) + edgeNoise >= 0;
          })
          .map((wood) => wood.density),
      );
    };
    const candidates = vegetationPlacements({
      seed,
      registry,
      scale,
      area,
      // Density is a multiplier on 2.13's unchanged seeded field, not a second tree generator.
      density: (x, z) => {
        const margin = tuning.vegetation.obstacleMarginMetres;
        if (
          sandy(Math.floor(x / s), Math.floor(z / s)) ||
          protectedBuildings.some((rect) => rectDistance(rect, x, z, s) <= margin) ||
          layout.tracks.some((track) => polylineDistance([x, z], track.points) <= track.width / 2 + margin) ||
          spawnPoints.some(([spawnX, spawnZ]) => Math.hypot(x - spawnX!, z - spawnZ!) <= margin)
        ) {
          return 0;
        }
        return Math.max(tuning.vegetation.openDensity, woodlandDensityAt(x, z)) * forestDensityAt(registry, seed, x, z);
      },
      shapeMix: (x, z) => (woodlandDensityAt(x, z) > 0 ? tuning.vegetation.treeMix : ['young']),
      ground: (x, z) => height(x, z, layout.ground / s),
      reserved: [
        ...reserved,
        ...protectedBuildings.map((rect) => grow(rectBlocks(rect), tuning.vegetation.obstacleMarginMetres / s)),
        ...spawnPoints.map(([x, z]) => {
          const cellX = Math.floor(x! / s);
          const cellZ = Math.floor(z! / s);
          return grow(
            { x0: cellX, x1: cellX + 1, z0: cellZ, z1: cellZ + 1 },
            tuning.vegetation.obstacleMarginMetres / s,
          );
        }),
      ],
    });
    const trees = candidates.filter((tree) => {
      const centreX = ((tree.bounds.x0 + tree.bounds.x1) / 2) * s;
      const centreZ = ((tree.bounds.z0 + tree.bounds.z1) / 2) * s;
      const radius = (Math.hypot(tree.bounds.x1 - tree.bounds.x0, tree.bounds.z1 - tree.bounds.z0) * s) / 2;
      return !layout.tracks.some(
        (track) => polylineDistance([centreX, centreZ], track.points) <= track.width / 2 + radius,
      );
    });
    this.treeIndex = new TreeIndex(trees);
    const { leafLitter: litter, terrain } = sitePalette(registry);
    this.surface = {
      height,
      ...(water && { water }),
      top: (x, z) => {
        if (sandy(x, z)) {
          return terrain.sand;
        }
        const track = trackAt(x, z);
        if (track) {
          return registry.blockIds.get(track.surface);
        }
        return leafLitterAt(this.treeIndex.at(x, z), x, z) ? litter : undefined;
      },
    };
    const markers = this.placements.flatMap(placedSpawns).map((marker) => ({
      type: marker.zombie,
      pos: marker.pos,
      chance: marker.chance,
      ...(marker.window ? { window: marker.window } : {}),
    }));
    const explicit = layout.shamblers.map((spawn) => ({
      ...spawn,
      pos: blocks(spawn.position),
      chance: spawn.chance ?? 1,
      ...(spawn.window ? { window: spawn.window } : {}),
    }));
    this.spawns = [...markers, ...explicit]
      .filter((spawn, i) => Rng.stream(seed, `layout:${layout.id}:spawn:${i}`).chance(spawn.chance))
      .map((spawn) => ({
        type: spawn.type,
        pos: spawn.pos,
        ...(spawn.window ? { window: spawn.window } : {}),
      }));
    this.hordes = (layout.hordes ?? []).map(({ id, position }) => ({
      id: `${layout.id}_${id}`,
      type: HORDE_TYPE,
      pos: blocks(position),
      members: Rng.stream(seed, `authored-horde:${layout.id}:${id}`).int(...HORDE_MEMBERS),
    }));
  }

  /** Wrappers reserve their derived floors before streaming so neither trees nor litter survive there. */
  reserveVegetation(areas: readonly Rect[]): void {
    this.treeIndex = new TreeIndex(this.trees.filter((tree) => !areas.some((area) => rectsOverlap(tree.bounds, area))));
  }

  focus(furniture: string): Site['spawn'] | undefined {
    const pose = this.showroom && focusPose(this.slots, furniture, this.showroom.focusDistance);
    return pose && { pos: [...pose.pos], yaw: pose.yaw };
  }

  stamp(chunk: Chunk): void {
    stampTrees(chunk, this.treeIndex.inColumn(chunk.cx, chunk.cz));
    for (const placement of this.placements) {
      stampPlacement(chunk, placement);
    }
  }

  supplySourcesIn(area: Rect) {
    return this.supplyFootprints.in(area);
  }

  lootPointsIn(cx: number, cz: number): readonly LootSpawnPoint[] {
    return this.lootColumns.get(`${cx},${cz}`) ?? [];
  }

  furnitureIn(cx: number, cz: number) {
    return this.placements.flatMap((placement) => furnitureOf(this, placement, [cx, cz], this.lootPointsIn(cx, cz)));
  }
  zombiesIn(cx: number, cz: number): ZombieSpawn[] {
    return this.spawns.filter((spawn) => toChunk(spawn.pos[0]) === cx && toChunk(spawn.pos[2]) === cz);
  }
  hordesIn(cx: number, cz: number): HordeSpawn[] {
    return this.hordes
      .filter((horde) => toChunk(horde.pos[0]) === cx && toChunk(horde.pos[2]) === cz)
      .map((horde) => ({ ...horde, pos: [...horde.pos] as Vec3 }));
  }
}
