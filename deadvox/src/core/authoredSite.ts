// Tiled is build-time only. This Site consumes validated layout JSON and existing ASCII templates.
import { inPolygon } from './authoredLayout.ts';
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
import { CHUNK, toChunk, type Vec3, yawFromBearing } from './coords.ts';
import { HAMLET_BLOCK_SIZE } from './hamlet.ts';
import { fixedItems, type Rolled } from './loot.ts';
import { Rng, simplexNoise2 } from './random.ts';
import type { Scale } from './scale.ts';
import type { SiteLayoutDef } from './schema.ts';
import { furnitureOf, grow, type PlaytestMarks, type Rect, type Site, type ZombieSpawn } from './site.ts';
import { footprint, type Placement, placedPieces, placedSpawns, stampPlacement } from './templates.ts';
import {
  forestDensityAt,
  leafLitterAt,
  stampTrees,
  TREE_MIX,
  TreeIndex,
  type TreePlacement,
  vegetationPlacements,
} from './vegetation.ts';
import type { Surface } from './worldgen.ts';

const collectFixedLoot = (
  registry: Registry,
  placements: readonly Placement[],
  buildings: SiteLayoutDef['buildings'],
) => {
  const fixedLoot = new Map<string, Rolled[]>();
  const fixedSurfaceLoot = new Map<string, Rolled[]>();
  const keyLoot = new Map<string, Set<string>>();
  placements.forEach((placement, buildingIndex) => {
    const building = buildings[buildingIndex]!;
    const placed = placedPieces(placement);
    for (const override of building.fixedLoot ?? []) {
      const localIndex = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === override.at.join(','));
      if (localIndex < 0) {
        continue;
      }
      const anchor = placed[localIndex]!.pos.join(',');
      const inContainer = override.items.filter((item) => item.placement !== 'surface');
      const onSurface = override.items.filter((item) => item.placement === 'surface');
      if (inContainer.length > 0) {
        fixedLoot.set(anchor, fixedItems(registry, inContainer));
      }
      if (onSurface.length > 0) {
        fixedSurfaceLoot.set(anchor, fixedItems(registry, onSurface));
      }
      const keys = override.items.filter((entry) => entry.key).map((entry) => entry.item);
      if (keys.length > 0) {
        keyLoot.set(anchor, new Set(keys));
      }
    }
  });
  return { fixedLoot, fixedSurfaceLoot, keyLoot };
};

export class AuthoredSite implements Site {
  readonly spawn: Site['spawn'];
  readonly surface: Surface;
  readonly placements: readonly Placement[];
  readonly skyBounds: NonNullable<Site['skyBounds']>;
  readonly trees: readonly TreePlacement[];
  private readonly spawns: readonly ZombieSpawn[];
  private readonly treeIndex: TreeIndex;
  private readonly fixedLoot: Map<string, Rolled[]>;
  private readonly fixedSurfaceLoot: Map<string, Rolled[]>;
  readonly playtestMarks: PlaytestMarks;
  readonly seed: number;
  readonly registry: Registry;

  constructor(seed: number, registry: Registry, scale: Scale, layout: SiteLayoutDef) {
    this.seed = seed;
    this.registry = registry;
    if (scale.blockSize !== HAMLET_BLOCK_SIZE) {
      throw new Error('Authored ASCII sites require 0.5 m blocks');
    }
    const s = scale.blockSize;
    const tuning = registry.siteGeneration.get('authored');
    if (!tuning) {
      throw new Error('Missing authored site generation tuning');
    }
    const rectBlocks = (rect: Rect): Rect => ({ x0: rect.x0 / s, x1: rect.x1 / s, z0: rect.z0 / s, z1: rect.z1 / s });
    const area = rectBlocks(layout.bounds);
    const lots = layout.buildings.map((building) => {
      const rect = buildingBounds(building, registry.templates.get(building.template)!.size);
      return { ...lotOf(building, rect), apron: grow(rectBlocks(rect), LOT_APRON_M / s) };
    });
    this.placements = layout.buildings.map((building) => placementOf(registry, building));
    const { fixedLoot: containerLoot, fixedSurfaceLoot, keyLoot } = collectFixedLoot(
      registry,
      this.placements,
      layout.buildings,
    );
    this.fixedLoot = containerLoot;
    this.fixedSurfaceLoot = fixedSurfaceLoot;
    this.playtestMarks = {
      beats: (layout.beats ?? []).map((beat) => ({ id: beat.id, area: rectBlocks(beat.area) })),
      keyLoot,
    };
    this.skyBounds = this.placements
      .filter((placement) => (placement.template.groundLayer ?? 0) > 0)
      .map((placement) => {
        const [w, d] = footprint(placement);
        return {
          min: [...placement.origin] as Vec3,
          max: [
            placement.origin[0] + w,
            placement.origin[1] + placement.template.size[1],
            placement.origin[2] + d,
          ] as Vec3,
        };
      });
    this.spawn = { pos: [...layout.player.position], yaw: yawFromBearing(layout.player.bearing) };
    const spawnPoints: [number, number][] = [
      [layout.player.position[0], layout.player.position[2]],
      ...layout.shamblers.map((spawn): [number, number] => [spawn.position[0], spawn.position[2]]),
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
          protectedBuildings.some((rect) => rectDistance(rect, x, z, s) <= margin) ||
          layout.tracks.some((track) => polylineDistance([x, z], track.points) <= track.width / 2 + margin) ||
          spawnPoints.some(([spawnX, spawnZ]) => Math.hypot(x - spawnX!, z - spawnZ!) <= margin)
        ) {
          return 0;
        }
        return Math.max(tuning.vegetation.openDensity, woodlandDensityAt(x, z)) * forestDensityAt(seed, x, z);
      },
      shapeMix: (x, z) => (woodlandDensityAt(x, z) > 0 ? TREE_MIX : ['young']),
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
    this.trees = candidates.filter((tree) => {
      const centreX = ((tree.bounds.x0 + tree.bounds.x1) / 2) * s;
      const centreZ = ((tree.bounds.z0 + tree.bounds.z1) / 2) * s;
      const radius = (Math.hypot(tree.bounds.x1 - tree.bounds.x0, tree.bounds.z1 - tree.bounds.z0) * s) / 2;
      return !layout.tracks.some(
        (track) => polylineDistance([centreX, centreZ], track.points) <= track.width / 2 + radius,
      );
    });
    this.treeIndex = new TreeIndex(this.trees);
    this.surface = {
      height,
      top: (x, z) => {
        const track = trackAt(x, z);
        if (track) {
          return registry.blockIds.get(track.surface ?? 'dirt');
        }
        return leafLitterAt(this.treeIndex.at(x, z), x, z) ? registry.blockIds.get('leaf_litter') : undefined;
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
  }

  stamp(chunk: Chunk): void {
    stampTrees(chunk, this.treeIndex.inColumn(chunk.cx, chunk.cz));
    for (const placement of this.placements) {
      stampPlacement(chunk, placement);
    }
  }

  furnitureIn(cx: number, cz: number) {
    return this.placements
      .flatMap((placement) => furnitureOf(this, placement, [cx, cz]))
      .map((spawn) => {
        const anchor = spawn.spec.pos.join(',');
        const fixed = this.fixedLoot.get(anchor);
        const surfaceLoot = this.fixedSurfaceLoot.get(anchor);
        return {
          ...spawn,
          ...(fixed ? { loot: [...fixed, ...spawn.loot] } : {}),
          ...(surfaceLoot ? { surfaceLoot } : {}),
        };
      });
  }
  zombiesIn(cx: number, cz: number): ZombieSpawn[] {
    return this.spawns.filter((spawn) => toChunk(spawn.pos[0]) === cx && toChunk(spawn.pos[2]) === cz);
  }
}
