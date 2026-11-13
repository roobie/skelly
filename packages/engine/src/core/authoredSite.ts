// Tiled is build-time only. This Site consumes validated layout JSON and existing ASCII templates.
import { inPolygon } from './authoredLayout.ts';
import { blocks, placementOf } from './authoredPlacement.ts';
import { buildingBounds, LOT_APRON_M, lotOf, polylineDistance, rectDistance } from './authoredTerrain.mjs';
import { type AuthoredGroundData, createAuthoredGround } from './authoredTerrainEvaluator.ts';
import { claimed, claimedId } from './capabilities.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3, yawFromBearing } from './coords.ts';
import { type LootSpawnPoint, lootPointsByColumn } from './loot.ts';
import { placementKeyLoot } from './placementLoot.ts';
import type { PublicCartographicFeature } from './publicCartography.ts';
import { Rng, simplexNoise2 } from './random.ts';
import type { Scale } from './scale.ts';
import type { SiteLayoutDef } from './schema.ts';
import { HORDE_MEMBERS, TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import {
  focusPose,
  loadedCatalogue,
  propCentre,
  type ShowroomCatalogue,
  type ShowroomDef,
  type ShowroomProp,
  slotPlacement,
  slotProps,
  yawToward,
} from './showroom.ts';
import {
  type ActorSpawn,
  furnitureOf,
  grow,
  type HordeSpawn,
  lootSourcesOf,
  type PlaytestMarks,
  type Rect,
  type Site,
  SupplyFootprints,
} from './site.ts';
import { sitePalette } from './sitePalette.ts';
import { type Placement, placedPieces, placedSpawns } from './templates.ts';
import { type SiteTerrainPlan, terrainPlacements } from './terrainPlan.ts';
import { forestDensityAt, type TreePlacement, vegetationPlacements } from './vegetation.ts';

const showroomOf = (registry: Registry, layout: SiteLayoutDef) => {
  const { showroom } = layout;
  return {
    showroom,
    props: showroom ? slotProps(registry, showroom) : [],
    catalogue: showroom?.catalogue ? loadedCatalogue(registry, showroom.catalogue) : undefined,
  };
};

export class AuthoredSite implements Site {
  readonly spawn: Site['spawn'];
  readonly terrain: SiteTerrainPlan;
  readonly placements: readonly Placement[];
  readonly publicCartography: readonly PublicCartographicFeature[];
  get authoredPlacements(): readonly Placement[] {
    return this.placements;
  }
  get trees(): readonly TreePlacement[] {
    return this.terrainTrees;
  }
  private readonly spawns: readonly ActorSpawn[];
  private readonly hordes: readonly HordeSpawn[];
  private readonly terrainTrees: readonly TreePlacement[];
  private readonly lootColumns: ReadonlyMap<string, readonly LootSpawnPoint[]>;
  private readonly supplyFootprints: SupplyFootprints;
  readonly playtestMarks: PlaytestMarks;
  readonly practiceExitMark?: string;
  readonly guidance?: import('./schema/guidance.ts').GuidanceDef | undefined;
  readonly seed: number;
  readonly registry: Registry;
  readonly showroom: ShowroomDef | undefined;
  readonly catalogue: ShowroomCatalogue | undefined;
  /** The showroom's authored props, oldest first. */
  readonly slots: readonly ShowroomProp[];

  readonly eventRules: readonly import('./schema/scenarios.ts').EventRuleDef[];

  // biome-ignore lint/complexity/useMaxParams: Scenario population and resolved events are runtime metadata, not authored layout fields.
  constructor(
    seed: number,
    registry: Registry,
    scale: Scale,
    layout: SiteLayoutDef,
    options: { authoredMarkers?: boolean; eventRules?: readonly import('./schema/scenarios.ts').EventRuleDef[] } = {},
  ) {
    this.eventRules = options.eventRules ?? [];
    this.seed = seed;
    this.registry = registry;
    if (scale.blockSize !== TEMPLATE_BLOCK_SIZE) {
      throw new Error('Authored ASCII sites require 0.5 m blocks');
    }
    const s = scale.blockSize;
    const tuning = claimed(registry.siteGeneration, 'authoredSite');
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
    this.guidance = layout.guidance;
    if (layout.practice) {
      this.practiceExitMark = layout.practice.exitMark;
    }
    const { showroom, props, catalogue } = showroomOf(registry, layout);
    this.showroom = showroom;
    this.catalogue = catalogue;
    this.slots = props;
    const newest = this.slots.at(-1);
    this.spawn = {
      pos: [...layout.player.position],
      yaw: newest ? yawToward(layout.player.position, propCentre(newest)) : yawFromBearing(layout.player.bearing),
    };
    const spawnPoints: [number, number][] = [
      [layout.player.position[0], layout.player.position[2]],
      ...layout.actors.map((spawn): [number, number] => [spawn.position[0], spawn.position[2]]),
      ...(layout.hordes ?? []).map((horde): [number, number] => [horde.position[0], horde.position[2]]),
      ...this.placements
        .flatMap(placedSpawns)
        .map((marker): [number, number] => [marker.pos[0] * s, marker.pos[2] * s]),
    ];
    const protectedBuildings = layout.buildings.map((building) =>
      buildingBounds(building, registry.templates.get(building.template)!.size),
    );
    const groundData: AuthoredGroundData = {
      blockSize: s,
      seed,
      topography: tuning.topography,
      protectedBuildings,
      layout: { bounds: layout.bounds, ground: layout.ground, terrain: layout.terrain, water: layout.water },
      spawnPoints,
      lots: lots.map(({ rect, floor, key }) => ({ rect, floor, key })),
      catalogue: catalogue?.terrain,
      tracks: layout.tracks.map((track) => ({
        points: track.points,
        width: track.width,
        surface: registry.blockIds.get(track.surface),
      })),
    };
    const ground = createAuthoredGround(groundData);
    const { height, sandy } = ground;
    const player = blocks(layout.player.position);
    const reserved = [
      ...(catalogue ? [catalogue.rect] : []),
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
    this.terrainTrees = trees;
    const { leafLitter: litter, terrain } = sitePalette(registry);
    this.terrain = {
      kind: 'authored',
      ground: groundData,
      data: { catalogue: catalogue?.terrain, trees, litter, sand: terrain.sand },
      placements: terrainPlacements(this.placements),
    };
    const markers = (options.authoredMarkers === false ? [] : this.placements.flatMap(placedSpawns)).map((marker) => ({
      type: marker.actor,
      pos: marker.pos,
      chance: marker.chance,
      ...(marker.window ? { window: marker.window } : {}),
    }));
    const explicit = layout.actors.map((spawn) => ({
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
      type: claimedId(registry.actors, 'settlementHorde'),
      pos: blocks(position),
      members: Rng.stream(seed, `authored-horde:${layout.id}:${id}`).int(...HORDE_MEMBERS),
    }));
  }

  focus(furniture: string): Site['spawn'] | undefined {
    const pose =
      this.showroom &&
      (focusPose(this.slots, furniture, this.showroom.focusDistance) ??
        (this.catalogue && focusPose(this.catalogue.props, furniture, this.showroom.focusDistance)));
    return pose && { pos: [...pose.pos], yaw: pose.yaw };
  }

  supplySourcesIn(area: Rect) {
    return [...this.supplyFootprints.in(area), ...(this.catalogue?.supplySourcesIn(area) ?? [])];
  }

  lootPointsIn(cx: number, cz: number): readonly LootSpawnPoint[] {
    return this.lootColumns.get(`${cx},${cz}`) ?? [];
  }

  furnitureIn(cx: number, cz: number) {
    return [
      ...this.placements.flatMap((placement) => furnitureOf(this, placement, [cx, cz], this.lootPointsIn(cx, cz))),
      ...(this.catalogue?.furnitureIn(cx, cz) ?? []),
    ];
  }
  actorsIn(cx: number, cz: number): ActorSpawn[] {
    return this.spawns.filter((spawn) => toChunk(spawn.pos[0]) === cx && toChunk(spawn.pos[2]) === cz);
  }
  hordesIn(cx: number, cz: number): HordeSpawn[] {
    return this.hordes
      .filter((horde) => toChunk(horde.pos[0]) === cx && toChunk(horde.pos[2]) === cz)
      .map((horde) => ({ ...horde, pos: [...horde.pos] as Vec3 }));
  }
}
