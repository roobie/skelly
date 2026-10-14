import { buildCityPlan, scenarioPlanIssues } from './cityPlan.ts';
import { CitySite } from './citySite.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import {
  HAMLET_HORDE_MEMBERS,
  HAMLET_HORDE_TYPE,
  HAMLET_TEMPLATES,
  hamletZombieSpawns,
  ordinaryHamletSpawnWeights,
} from './hamlet.ts';
import { hash3, Rng } from './random.ts';
import type { Scale } from './scale.ts';
import { scenarioCertificate } from './scenarioCertificate.ts';
import type { ScenarioDef } from './schema.ts';
import type { HordeSpawn, ZombieSpawn } from './site.ts';
import { footprint, placedSpawns } from './templates.ts';
import { terrainHeight } from './worldgen.ts';

export class GauntletSite extends CitySite {
  readonly scenario: ScenarioDef;
  private readonly population = new Map<string, ZombieSpawn[]>();
  private readonly hordes = new Map<string, HordeSpawn[]>();

  constructor(seed: number, registry: Registry, scale: Scale, scenario: ScenarioDef) {
    const issues = scenarioPlanIssues(registry, scenario);
    if (issues.length > 0) {
      throw new Error(issues.map(([path, message]) => `${path}: ${message}`).join('\n'));
    }
    super(
      seed,
      registry,
      scale,
      buildCityPlan({ seed, registry, floor: terrainHeight(seed, scale, 0, 0), grid: scenario.city, scenario }),
    );
    const certificate = scenarioCertificate(this);
    if (certificate.issues.length > 0) {
      throw new Error(certificate.issues.map(([path, message]) => `${path}: ${message}`).join('\n'));
    }
    this.scenario = scenario;
    const population = gauntletPopulation(this, scenario.id);
    this.population = population.zombies;
    this.hordes = population.hordes;
  }

  override zombiesIn(cx: number, cz: number): ZombieSpawn[] {
    return this.population.get(`${cx},${cz}`) ?? [];
  }

  hordesIn(cx: number, cz: number): HordeSpawn[] {
    return this.hordes.get(`${cx},${cz}`) ?? [];
  }
}

export const gauntletPopulation = (site: CitySite, scenarioId: string) => {
  const zombies = new Map<string, ZombieSpawn[]>();
  const hordes = new Map<string, HordeSpawn[]>();
  const { grid, floor } = site.plan;
  const ordinary = site.placements.filter((placement) => grid.templates.includes(placement.template.id));
  const weights = ordinaryHamletSpawnWeights(site.registry);
  const append = <T extends { pos: Vec3 }>(columns: Map<string, T[]>, spawn: T) => {
    const key = `${toChunk(spawn.pos[0])},${toChunk(spawn.pos[2])}`;
    const column = columns.get(key) ?? [];
    column.push(spawn);
    columns.set(key, column);
  };
  // Scale the ordinary settlement population by buildings, not by empty reserved-campus area.
  for (let start = 0; start < ordinary.length; start += HAMLET_TEMPLATES.length) {
    const group = ordinary.slice(start, start + HAMLET_TEMPLATES.length);
    const first = group[0]!;
    const [width, depth] = footprint(first);
    const z =
      first.turn === 0
        ? first.origin[2] - grid.pad - grid.street / 2
        : first.origin[2] + depth + grid.pad + grid.street / 2;
    const road = { x0: first.origin[0], x1: first.origin[0] + width, z0: z - grid.street / 2, z1: z + grid.street / 2 };
    const seed = Math.floor(hash3(site.seed, start, 0, 601) * 0x7f_ff_ff_ff);
    for (const spawn of hamletZombieSpawns(seed, road, group.flatMap(placedSpawns), {
      roadHeightAt: () => floor,
      spawnWeights: weights,
      roadsideOffset: grid.street / 4,
    })) {
      append(zombies, spawn);
    }
    append(hordes, {
      id: `scenario:${scenarioId}:horde:${start}`,
      type: HAMLET_HORDE_TYPE,
      pos: [(road.x0 + road.x1) / 2, floor + 1, z],
      members: Rng.stream(seed, 'hamlet-first-horde').int(...HAMLET_HORDE_MEMBERS),
    });
  }
  for (const marker of site.placements.filter((placement) => !ordinary.includes(placement)).flatMap(placedSpawns)) {
    if (Rng.stream(site.seed, `scenario:${scenarioId}:spawn:${marker.pos.join(',')}`).chance(marker.chance)) {
      append(zombies, { type: marker.zombie, pos: marker.pos, ...(marker.window ? { window: marker.window } : {}) });
    }
  }
  return { zombies, hordes };
};
