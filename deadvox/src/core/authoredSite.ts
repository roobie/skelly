// Tiled is build-time only. This Site consumes validated layout JSON and existing ASCII templates.
import { buildingBounds, inPolygon, polylineDistance } from './authoredLayout.ts';
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { HAMLET_BLOCK_SIZE } from './hamlet.ts';
import { Rng } from './random.ts';
import type { Scale } from './scale.ts';
import type { SiteLayoutDef } from './schema.ts';
import { furnitureOf, grow, type Rect, rectDistance, type Site, smoothstep, type ZombieSpawn } from './site.ts';
import {
  compileTemplate,
  type Placement,
  placedSpawns,
  stackTemplate,
  stampPlacement,
  type Turn,
} from './templates.ts';
import {
  forestDensityAt,
  leafLitterAt,
  stampTrees,
  TreeIndex,
  type TreePlacement,
  vegetationPlacements,
} from './vegetation.ts';
import type { Surface } from './worldgen.ts';

export class AuthoredSite implements Site {
  readonly spawn: Site['spawn'];
  readonly surface: Surface;
  readonly placements: readonly Placement[];
  readonly trees: readonly TreePlacement[];
  private readonly spawns: readonly ZombieSpawn[];
  private readonly treeIndex: TreeIndex;
  readonly seed: number;
  readonly registry: Registry;

  constructor(seed: number, registry: Registry, scale: Scale, layout: SiteLayoutDef) {
    this.seed = seed;
    this.registry = registry;
    if (scale.blockSize !== HAMLET_BLOCK_SIZE) {
      throw new Error('Authored ASCII sites require 0.5 m blocks');
    }
    const s = scale.blockSize;
    const blocks = (position: readonly number[]) => position.map((n) => n / s) as Vec3;
    const rectBlocks = (rect: Rect): Rect => ({ x0: rect.x0 / s, x1: rect.x1 / s, z0: rect.z0 / s, z1: rect.z1 / s });
    const area = rectBlocks(layout.bounds);
    const lots = layout.buildings.map((building) => ({
      rect: rectBlocks(buildingBounds(building, registry.templates.get(building.template)!.size)),
      floor: building.position[1] / s,
    }));
    this.placements = layout.buildings.map((building) => ({
      template: stackTemplate(
        compileTemplate(registry, registry.templates.get(building.template)!),
        building.storeys ?? 1,
      ),
      origin: blocks(building.position),
      turn: (building.rotation / 90) as Turn,
    }));
    this.spawn = { pos: [...layout.player.position], yaw: (layout.player.yaw * Math.PI) / 180 };
    const height = (x: number, z: number, natural: number): number => {
      for (const lot of lots) {
        const distance = rectDistance(grow(lot.rect, 2 / s), x, z);
        if (distance < 4 / s) {
          return Math.round(lot.floor + (layout.ground / s - lot.floor) * smoothstep(distance / (4 / s)));
        }
      }
      const distance = rectDistance(area, x, z);
      return Math.round(
        layout.ground / s + (natural - layout.ground / s) * smoothstep(Math.min(1, distance / (16 / s))),
      );
    };
    const trackAt = (x: number, z: number) =>
      layout.tracks.find((track) => polylineDistance([(x + 0.5) * s, (z + 0.5) * s], track.points) <= track.width / 2);
    const player = blocks(layout.player.position);
    const reserved = [
      ...lots.map((lot) => grow(lot.rect, 2 / s)),
      { x0: player[0] - 3 / s, x1: player[0] + 3 / s, z0: player[2] - 3 / s, z1: player[2] + 3 / s },
    ];
    const candidates = vegetationPlacements({
      seed,
      registry,
      scale,
      area,
      // Density is a multiplier on 2.13's unchanged seeded field, not a second tree generator.
      density: (x, z) =>
        Math.max(0, ...layout.woodlands.filter((wood) => inPolygon([x, z], wood.polygon)).map((wood) => wood.density)) *
        forestDensityAt(seed, x, z),
      ground: (x, z) => height(x, z, layout.ground / s),
      reserved,
    });
    this.trees = candidates.filter((tree) => {
      const [x, , z] = tree.origin;
      const radius = (Math.hypot(tree.bounds.x1 - tree.bounds.x0, tree.bounds.z1 - tree.bounds.z0) * s) / 2;
      return !layout.tracks.some((track) => polylineDistance([x * s, z * s], track.points) <= track.width / 2 + radius);
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
    }));
    const explicit = layout.shamblers.map((spawn) => ({
      ...spawn,
      pos: blocks(spawn.position),
      chance: spawn.chance ?? 1,
    }));
    this.spawns = [...markers, ...explicit]
      .filter((spawn, i) => Rng.stream(seed, `layout:${layout.id}:spawn:${i}`).chance(spawn.chance))
      .map(({ type, pos }) => ({ type, pos }));
  }

  stamp(chunk: Chunk): void {
    stampTrees(chunk, this.treeIndex.inColumn(chunk.cx, chunk.cz));
    for (const placement of this.placements) {
      stampPlacement(chunk, placement);
    }
  }

  furnitureIn(cx: number, cz: number) {
    return this.placements.flatMap((placement) => furnitureOf(this, placement, [cx, cz]));
  }
  zombiesIn(cx: number, cz: number): ZombieSpawn[] {
    return this.spawns.filter((spawn) => toChunk(spawn.pos[0]) === cx && toChunk(spawn.pos[2]) === cz);
  }
}
