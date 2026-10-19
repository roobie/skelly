import { lotChoices } from './cityLots.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { ScenarioDef } from './schema.ts';
import {
  templateBodySpace,
  templateClimbCertificate,
  templateWalkingRoute,
  templateWalkingRoutes,
} from './templateSpatial.ts';
import {
  type CompiledTemplate,
  compileAssembly,
  compileTemplate,
  type Placement,
  placedPieces,
  placedPoint,
  templateEnvelope,
  templateResolves,
} from './templates.ts';

type StartDef = NonNullable<ScenarioDef['composition']>['start'];
type DescentDef = StartDef['descents'][number];
export type StartDescent = DescentDef extends infer D
  ? D extends DescentDef
    ? { readonly [K in keyof D]: D[K] extends Vec3 ? Readonly<Vec3> : D[K] }
    : never
  : never;

const descentPoints = (descent: DescentDef) =>
  Object.entries(descent).filter(([name]) => name !== 'kind') as [string, Vec3][];

const hasHatch = (registry: Registry, template: CompiledTemplate, point: Vec3): boolean =>
  template.pieces.some(
    (piece) => piece.pos.join(',') === point.join(',') && Boolean(registry.furniture.get(piece.furniture)?.door?.hatch),
  );

export interface ScenarioStart {
  readonly placement: Placement;
  readonly spawn: Readonly<Vec3>;
  readonly minimumOpenDescents: number;
  readonly descents: readonly StartDescent[];
}

export const startTemplate = (registry: Registry, id: string, seed: number, siteId: string) => {
  const template = registry.templates.get(id);
  const assembly = registry.mapAssemblies.get(id);
  if ((template && assembly) || !(template || assembly) || (template && !templateResolves(registry, template))) {
    throw new Error(`missing, ambiguous or unresolved start template/assembly "${id}"`);
  }
  return assembly ? compileAssembly(registry, assembly, { seed, siteId }) : compileTemplate(registry, template!);
};

const skylineIssues = (registry: Registry, scenario: ScenarioDef, template: CompiledTemplate): [string, string][] => {
  const { city, composition } = scenario;
  const buildingIds = new Set([
    scenario.serviceTemplate,
    ...[...(city.fillRows === false ? [] : [city.pool]), ...(city.ring ? [city.ring.pool] : [])].flatMap((id) =>
      (registry.mapPools.get(id)?.choices ?? []).map(({ ref }) => ref.id),
    ),
    ...(city.lots ?? []).flatMap((lot) => lotChoices(registry, city, lot).map(({ ref }) => ref.id)),
    ...composition!.leads.map((lead) => lead.template),
    ...composition!.landmarks,
    ...composition!.incidentalTemplates,
  ]);
  const roofHeight = composition!.start.spawn[1] - (template.groundLayer ?? 0);
  return [...buildingIds].flatMap((id): [string, string][] => {
    const definition = registry.mapAssemblies.get(id) ?? registry.templates.get(id);
    if (!definition) {
      throw new Error(`missing skyline template/assembly "${id}"`);
    }
    // Seeded choices cannot outgrow the envelope that the compiler enforces.
    const building = templateEnvelope(definition);
    return building.size[1] - (building.groundLayer ?? 0) >= roofHeight
      ? [
          [
            '.composition.start.template',
            `start roof must stand above "${id}"; raise the start building or lower the other building`,
          ],
        ]
      : [];
  });
};

export const scenarioStartIssues = (registry: Registry, scenario: ScenarioDef): [string, string][] => {
  const start = scenario.composition?.start;
  if (!start) {
    return [];
  }
  const issues: [string, string][] = [];
  try {
    const template = startTemplate(registry, start.template, 0, `scenario:${scenario.id}:start`);
    const { city } = scenario;
    if (
      start.cell[0] < -city.blocksX ||
      start.cell[0] >= city.blocksX ||
      start.cell[1] < -city.blocksZ ||
      start.cell[1] >= city.blocksZ
    ) {
      issues.push(['.composition.start.cell', 'start cell must lie inside the street grid']);
    }
    if (template.size[0] > city.blockX - 2 * city.pad || template.size[2] > city.blockZ - 2 * city.pad) {
      issues.push(['.composition.start.template', 'start template must fit inside its reserved city block']);
    }
    const anchor = (point: Vec3, path: string) => {
      if (point.some((value, axis) => value < 0 || value >= template.size[axis]!)) {
        issues.push([path, 'anchor outside start template']);
      }
    };
    anchor(start.spawn, '.composition.start.spawn');
    if (!templateBodySpace(registry, template).standing(start.spawn)) {
      issues.push(['.composition.start.spawn', 'spawn needs supported standing body clearance']);
    }
    if (start.minimumOpenDescents > start.descents.length) {
      issues.push(['.composition.start.minimumOpenDescents', 'minimum exceeds the authored ways down']);
    }
    issues.push(...skylineIssues(registry, scenario, template));
    const placement: Placement = { template, origin: [0, 0, 0], turn: 0 };
    const roofRoutes = templateWalkingRoutes(
      registry,
      template,
      start.spawn,
      start.descents.map(({ upper }) => upper),
    );
    start.descents.forEach((descent, index) => {
      const path = `.composition.start.descents[${index}]`;
      for (const [name, point] of descentPoints(descent)) {
        anchor(point, `${path}.${name}`);
      }
      if (!roofRoutes[index]) {
        issues.push([path, 'way down must be reachable from the roof spawn']);
      }
      switch (descent.kind) {
        case 'ladder': {
          const issue = templateClimbCertificate(registry, placement, descent);
          if (issue) {
            issues.push([path, issue]);
          }
          break;
        }
        case 'stairs':
          if (!templateWalkingRoute(registry, template, descent.upper, descent.lower)) {
            issues.push([path, 'stairs need a supported body route']);
          }
          if (!hasHatch(registry, template, descent.hatch)) {
            issues.push([`${path}.hatch`, 'stairs need an actual hatch anchor']);
          }
          break;
        default:
          break;
      }
    });
  } catch (error) {
    issues.push(['.composition.start.template', error instanceof Error ? error.message : String(error)]);
  }
  return issues;
};

export const composeStart = (start: StartDef, placement: Placement): ScenarioStart => {
  const point = (local: Vec3): Readonly<Vec3> => Object.freeze(placedPoint(placement, local));
  const pieces = placedPieces(placement);
  const furniture = (local: Vec3): Readonly<Vec3> => {
    const index = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === local.join(','));
    if (index < 0) {
      throw new Error(`Missing start furniture anchor ${local.join(',')}`);
    }
    return Object.freeze([...pieces[index]!.pos]) as Readonly<Vec3>;
  };
  return Object.freeze({
    placement,
    spawn: point(start.spawn),
    minimumOpenDescents: start.minimumOpenDescents,
    descents: Object.freeze(
      start.descents.map((descent): StartDescent => {
        const endpoints = { upper: point(descent.upper), lower: point(descent.lower) };
        switch (descent.kind) {
          case 'ladder':
            return Object.freeze({ kind: descent.kind, ...endpoints, ladder: furniture(descent.ladder) });
          case 'stairs':
            return Object.freeze({ kind: descent.kind, ...endpoints, hatch: furniture(descent.hatch) });
          case 'drop':
            return Object.freeze({
              kind: descent.kind,
              ...endpoints,
              edge: point(descent.edge),
              landing: point(descent.landing),
            });
          default:
            throw new Error(`Unsupported start descent ${JSON.stringify(descent)}`);
        }
      }),
    ),
  });
};
