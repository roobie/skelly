import { buildCityPlan, cityGridOf, scenarioPlanIssues } from './cityPlan.ts';
import { CitySite } from './citySite.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { hamletHordeSpawn, hamletZombieSpawns, ordinaryHamletSpawnWeights } from './hamlet.ts';
import { hash3, Rng } from './random.ts';
import type { Scale } from './scale.ts';
import { scenarioCertificate } from './scenarioCertificate.ts';
import type { ScenarioDef } from './schema.ts';
import type { HordeSpawn, ZombieSpawn } from './site.ts';
import { hamletTemplateIds } from './sitePalette.ts';
import { footprint, placedSpawns } from './templates.ts';
import { terrainHeight } from './worldgen.ts';

export class GauntletSite extends CitySite {
  readonly scenario: ScenarioDef;
  private readonly population = new Map<string, ZombieSpawn[]>();
  private readonly hordes = new Map<string, HordeSpawn[]>();

  constructor({
    seed,
    registry,
    scale,
    scenario,
    settlementPressure = true,
    authoredMarkers = true,
  }: {
    seed: number;
    registry: Registry;
    scale: Scale;
    scenario: ScenarioDef;
    settlementPressure?: boolean;
    authoredMarkers?: boolean;
  }) {
    const issues = scenarioPlanIssues(registry, scenario);
    if (issues.length > 0) {
      throw new Error(issues.map(([path, message]) => `${path}: ${message}`).join('\n'));
    }
    super(
      seed,
      registry,
      scale,
      buildCityPlan({
        seed,
        registry,
        floor: terrainHeight(seed, scale, 0, 0),
        grid: cityGridOf(registry, scenario.city),
        scenario,
      }),
    );
    const certificate = scenarioCertificate(this);
    if (certificate.issues.length > 0) {
      throw new Error(certificate.issues.map(([path, message]) => `${path}: ${message}`).join('\n'));
    }
    this.scenario = scenario;
    const population = gauntletPopulation(this, scenario.id, settlementPressure, authoredMarkers);
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

const gauntletPopulation = (
  site: CitySite,
  scenarioId: string,
  settlementPressure: boolean,
  authoredMarkers: boolean,
) => {
  const zombies = new Map<string, ZombieSpawn[]>();
  const hordes = new Map<string, HordeSpawn[]>();
  const { grid, floor } = site.plan;
  const ordinary = site.placements.filter((placement) => grid.templates.some(({ id }) => id === placement.template.id));
  const weights = ordinaryHamletSpawnWeights(site.registry);
  const append = <T extends { pos: Vec3 }>(columns: Map<string, T[]>, spawn: T) => {
    const key = `${toChunk(spawn.pos[0])},${toChunk(spawn.pos[2])}`;
    const column = columns.get(key) ?? [];
    column.push(spawn);
    columns.set(key, column);
  };
  // Scale the ordinary settlement population by buildings, not by empty reserved-campus area.
  const perGroup = hamletTemplateIds(site.registry).length;
  for (let start = 0; settlementPressure && start < ordinary.length; start += perGroup) {
    const group = ordinary.slice(start, start + perGroup);
    const first = group[0]!;
    const [, depth] = footprint(first);
    const frontage = group.filter(
      (placement) => placement.origin[2] === first.origin[2] && placement.turn === first.turn,
    );
    const z =
      first.turn === 0
        ? first.origin[2] - grid.pad - grid.street / 2
        : first.origin[2] + depth + grid.pad + grid.street / 2;
    const road = {
      x0: Math.min(...frontage.map((placement) => placement.origin[0])),
      x1: Math.max(...frontage.map((placement) => placement.origin[0] + footprint(placement)[0])),
      z0: z - grid.street / 2,
      z1: z + grid.street / 2,
    };
    const seed = Math.floor(hash3(site.seed, start, 0, 601) * 0x7f_ff_ff_ff);
    for (const spawn of hamletZombieSpawns(seed, road, group.flatMap(placedSpawns), {
      roadHeightAt: () => floor,
      spawnWeights: weights,
      roadsideOffset: grid.street / 4,
    })) {
      append(zombies, spawn);
    }
    append(
      hordes,
      hamletHordeSpawn(seed, road, () => floor, `scenario:${scenarioId}:horde:${start}`),
    );
  }
  const authored = authoredMarkers ? site.placements.filter((placement) => !ordinary.includes(placement)) : [];
  for (const marker of authored.flatMap(placedSpawns)) {
    if (Rng.stream(site.seed, `scenario:${scenarioId}:spawn:${marker.pos.join(',')}`).chance(marker.chance)) {
      append(zombies, { type: marker.zombie, pos: marker.pos, ...(marker.window ? { window: marker.window } : {}) });
    }
  }
  return { zombies, hordes };
};
