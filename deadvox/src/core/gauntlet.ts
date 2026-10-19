import { buildCityPlan, type CityGrid, cityGridOf, scenarioPlanIssues } from './cityPlan.ts';
import { CitySite } from './citySite.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { hamletHordeSpawn, hamletZombieSpawns, ordinaryHamletSpawnWeights } from './hamlet.ts';
import { hash3, Rng } from './random.ts';
import type { Scale } from './scale.ts';
import { scenarioCertificate } from './scenarioCertificate.ts';
import type { ScenarioDef } from './schema.ts';
import { type HordeSpawn, rectDistance, type ZombieSpawn } from './site.ts';
import { terrainShapeOf } from './sitePalette.ts';
import { footprint, type Placement, placedSpawns } from './templates.ts';
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
  }: {
    seed: number;
    registry: Registry;
    scale: Scale;
    scenario: ScenarioDef;
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
        floor: terrainHeight(seed, terrainShapeOf(registry), scale, 0, 0),
        grid: cityGridOf(registry, scenario.city),
        scenario,
      }),
    );
    const certificate = scenarioCertificate(this);
    if (certificate.issues.length > 0) {
      throw new Error(certificate.issues.map(([path, message]) => `${path}: ${message}`).join('\n'));
    }
    this.scenario = scenario;
    const population = gauntletPopulation(this, scenario);
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

const groupRoad = (group: Placement[], grid: CityGrid) => {
  const first = group[0]!;
  const [width, depth] = footprint(first);
  if (first.turn % 2 === 1) {
    const x =
      first.turn === 1
        ? first.origin[0] + width + grid.pad + grid.street / 2
        : first.origin[0] - grid.pad - grid.street / 2;
    return { x0: x - grid.street / 2, x1: x + grid.street / 2, z0: first.origin[2], z1: first.origin[2] + depth };
  }
  const frontage = group.filter(
    (placement) => placement.origin[2] === first.origin[2] && placement.turn === first.turn,
  );
  const z =
    first.turn === 0
      ? first.origin[2] - grid.pad - grid.street / 2
      : first.origin[2] + depth + grid.pad + grid.street / 2;
  return {
    x0: Math.min(...frontage.map((placement) => placement.origin[0])),
    x1: Math.max(...frontage.map((placement) => placement.origin[0] + footprint(placement)[0])),
    z0: z - grid.street / 2,
    z1: z + grid.street / 2,
  };
};

const groupStarts = (count: number, size: number) =>
  Array.from({ length: Math.ceil(count / size) }, (_, i) => i * size);

const ordinaryBuildings = (site: CitySite): Placement[] => {
  const { grid, core } = site.plan;
  const poolLots = site.plan.lots?.filter(({ definition }) => definition.source?.kind === 'pool');
  return poolLots?.length
    ? poolLots.flatMap(({ placement }) => (placement ? [placement] : []))
    : site.placements.filter(
        (placement) =>
          grid.templates.some(({ id }) => id === placement.template.id) &&
          rectDistance(core, placement.origin[0], placement.origin[2]) === 0,
      );
};
const authoredHordeSpawns = (
  site: CitySite,
  population: ScenarioDef['population'],
  scenarioId: string,
): HordeSpawn[] => {
  if (!(population.settlementPressure && population.hordeAreas)) {
    return [];
  }
  return population.hordeAreas
    .slice(0, population.hordes)
    .map((area, index) =>
      hamletHordeSpawn(site.seed, area, () => site.floor, `scenario:${scenarioId}:horde:area:${index}`),
    );
};
const hordeGroupStarts = (seed: number, starts: number[], population: ScenarioDef['population']): Set<number> => {
  const { hordes, hordeAreas, settlementPressure } = population;
  const capacity = hordeAreas?.length ?? starts.length;
  if (settlementPressure && hordes > capacity) {
    throw new Error(`.population.hordes: ${hordes} hordes asked for, but the city has ${capacity} spawn areas`);
  }
  return new Set(
    [...starts].sort((a, b) => hash3(seed, a, 0, 602) - hash3(seed, b, 0, 602)).slice(0, hordeAreas ? 0 : hordes),
  );
};

export const gauntletPopulation = (site: CitySite, { id: scenarioId, population }: ScenarioDef) => {
  const zombies = new Map<string, ZombieSpawn[]>();
  const hordes = new Map<string, HordeSpawn[]>();
  const { grid, floor } = site.plan;
  const ordinary = ordinaryBuildings(site);
  const weights = ordinaryHamletSpawnWeights(site.registry);
  const append = <T extends { pos: Vec3 }>(columns: Map<string, T[]>, spawn: T) => {
    const key = `${toChunk(spawn.pos[0])},${toChunk(spawn.pos[2])}`;
    const column = columns.get(key) ?? [];
    column.push(spawn);
    columns.set(key, column);
  };
  // Scale the ordinary settlement population by buildings, not by empty reserved-campus area.
  const { groupSize, roadsideOffset, extraStragglers, settlementPressure, authoredMarkers } = population;
  const starts = settlementPressure ? groupStarts(ordinary.length, groupSize) : [];
  const hordeStarts = hordeGroupStarts(site.seed, starts, population);
  for (const start of starts) {
    const group = ordinary.slice(start, start + groupSize);
    const road = groupRoad(group, grid);
    const seed = Math.floor(hash3(site.seed, start, 0, 601) * 0x7f_ff_ff_ff);
    for (const spawn of hamletZombieSpawns(seed, road, group.flatMap(placedSpawns), {
      roadHeightAt: () => floor,
      spawnWeights: weights,
      roadsideOffset,
      extraWanderers: extraStragglers,
    })) {
      append(zombies, spawn);
    }
    if (hordeStarts.has(start)) {
      append(
        hordes,
        hamletHordeSpawn(seed, road, () => floor, `scenario:${scenarioId}:horde:${start}`),
      );
    }
  }
  for (const spawn of authoredHordeSpawns(site, population, scenarioId)) {
    append(hordes, spawn);
  }
  const authored = authoredMarkers ? site.placements.filter((placement) => !ordinary.includes(placement)) : [];
  for (const marker of authored.flatMap(placedSpawns)) {
    if (Rng.stream(site.seed, `scenario:${scenarioId}:spawn:${marker.pos.join(',')}`).chance(marker.chance)) {
      append(zombies, { type: marker.zombie, pos: marker.pos, ...(marker.window ? { window: marker.window } : {}) });
    }
  }
  return { zombies, hordes };
};
