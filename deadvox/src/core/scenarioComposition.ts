import { lotChoices, type PlannedLot } from './cityLots.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type PlacementLootSource, placementLootIssues } from './placementLoot.ts';
import { composeStart, type ScenarioStart } from './scenarioStart.ts';
import type { ScenarioDef } from './schema.ts';
import { admittedChoices, cityRowDepth } from './settlementPools.ts';
import {
  type CompiledTemplate,
  compileTemplate,
  type Placement,
  placedPieces,
  placedPoint,
  templateResolves,
} from './templates.ts';

export interface ScenarioComposition {
  readonly start: ScenarioStart;
  readonly leads: readonly Placement[];
  readonly leadFaces?: readonly (Readonly<Vec3> | undefined)[];
  readonly landmarks: readonly Placement[];
  readonly lootSources: readonly PlacementLootSource[];
  readonly objective: Readonly<Vec3>;
  readonly objectiveFace: Readonly<Vec3>;
  readonly retreat: Readonly<Vec3>;
  readonly resources: readonly { readonly at: Readonly<Vec3>; readonly standing: Readonly<Vec3> }[];
  readonly storeys: readonly { readonly id: string; readonly standing: Readonly<Vec3> }[];
  readonly descents: readonly {
    readonly ladder: Readonly<Vec3>;
    readonly upper: Readonly<Vec3>;
    readonly lower: Readonly<Vec3>;
  }[];
}

type CompositionDef = NonNullable<ScenarioDef['composition']>;
type Issue = [string, string];
type ExtraKind = 'leads' | 'landmarks' | 'incidentalTemplates';

const leadPlacementIssues = (scenario: ScenarioDef, index: number, size: Vec3): Issue[] => {
  const lead = scenario.composition!.leads[index]!;
  const { city } = scenario;
  const path = `.composition.leads[${index}]`;
  if (lead.lot) {
    const parent = city.lots?.find((lot) => lot.id === lead.lot);
    return parent?.source && parent.source.kind !== 'pool' && lead.at && lead.standing
      ? []
      : [[path, 'a named lead needs a fixed building lot, local placement and readable standing pose']];
  }
  return [size[0], size[2]].some((extent) => extent > city.street / 2 - 1)
    ? [[path, 'public lead must fit beside its street junction']]
    : [];
};

const extraTemplateIssues = (
  registry: Registry,
  scenario: ScenarioDef,
  service: CompiledTemplate,
  { id, index, kind }: { id: string; index: number; kind: ExtraKind },
): Issue[] => {
  const path = `.composition.${kind}[${index}]`;
  const template = registry.templates.get(id);
  if (!(template && templateResolves(registry, template))) {
    return [[path, `missing or unresolved template "${id}"`]];
  }
  const issues: Issue[] = [];
  const { city } = scenario;
  const side = Math.max(service.size[0], service.size[2]);
  if (kind === 'leads') {
    issues.push(...leadPlacementIssues(scenario, index, template.size));
    const compiled = compileTemplate(registry, template);
    const { pieces } = compiled;
    const fixedLoot = scenario.composition!.leads[index]!.fixedLoot ?? [];
    issues.push(
      ...placementLootIssues({ registry, context: template.lootContext }, compiled, fixedLoot, `${path}.fixedLoot`),
    );
    const readableItem = fixedLoot.some((source) =>
      source.items.some((item) => registry.items.get(item.item)?.readable),
    );
    if (!(readableItem || pieces.some((piece) => registry.furniture.get(piece.furniture)?.readable))) {
      issues.push([path, 'public lead needs an ordinary readable source']);
    }
  } else if (kind === 'landmarks') {
    if (
      !scenario.composition?.landmarkPositions &&
      (side + 4 + template.size[0] > city.blockX - 2 * city.pad ||
        index * Math.floor(side / 2) + template.size[2] > side)
    ) {
      issues.push([path, 'landmark must fit outside every service turn in the reserved block']);
    }
  } else if (template.size[0] > city.blockX - 2 * city.pad || 2 * template.size[2] > city.blockZ - 2 * city.pad) {
    issues.push([path, 'incidental utility must fit an ordinary city row']);
  }
  return issues;
};

const localAnchorIssues = (registry: Registry, composition: CompositionDef, service: CompiledTemplate): Issue[] => {
  const issues: Issue[] = [];
  const anchor = (point: Vec3, path: string): void => {
    if (point.some((value, axis) => value < 0 || value >= service.size[axis]!)) {
      issues.push([path, 'anchor outside service excavation']);
    }
  };
  anchor(composition.objective, '.composition.objective');
  anchor(composition.objectiveFace, '.composition.objectiveFace');
  anchor(composition.retreat, '.composition.retreat');
  if (
    !service.pieces.some(
      (piece) =>
        piece.pos.join(',') === composition.objective.join(',') &&
        registry.furniture.get(piece.furniture)?.scenarioGoal,
    )
  ) {
    issues.push(['.composition.objective', 'objective needs a scenario-goal furniture anchor']);
  }
  composition.storeys.forEach((storey, index) => {
    anchor(storey.standing, `.composition.storeys[${index}]`);
  });
  composition.resources.forEach((resource, index) => {
    anchor(resource.standing, `.composition.resources[${index}].standing`);
    if (!composition.fixedLoot.some((source) => source.at.join(',') === resource.at.join(','))) {
      issues.push([`.composition.resources[${index}].at`, 'resource needs a fixed loot source']);
    }
  });
  composition.descents.forEach((descent, index) => {
    for (const key of ['ladder', 'upper', 'lower'] as const) {
      anchor(descent[key], `.composition.descents[${index}].${key}`);
    }
    if (
      !service.pieces.some(
        (piece) =>
          piece.pos.join(',') === descent.ladder.join(',') && registry.furniture.get(piece.furniture)?.climbable,
      )
    ) {
      issues.push([`.composition.descents[${index}].ladder`, 'descent needs an actual ladder anchor']);
    }
  });
  return issues;
};

export const scenarioCompositionIssues = (
  registry: Registry,
  scenario: ScenarioDef,
  service: CompiledTemplate,
): Issue[] => {
  const { composition } = scenario;
  if (!composition) {
    return [];
  }
  const issues = placementLootIssues(
    { registry, context: service.lootContext },
    service,
    composition.fixedLoot,
    '.composition.fixedLoot',
  );
  for (const kind of ['leads', 'landmarks', 'incidentalTemplates'] as const) {
    composition[kind].forEach((ref, index) => {
      const id = typeof ref === 'string' ? ref : ref.template;
      issues.push(...extraTemplateIssues(registry, scenario, service, { id, index, kind }));
    });
  }
  issues.push(...localAnchorIssues(registry, composition, service));
  return issues;
};

const scenarioBuildingSources = (registry: Registry, scenario: ScenarioDef): string[] => {
  const { city } = scenario;
  if (!registry.mapPools.has(city.pool) || (city.ring && !registry.mapPools.has(city.ring.pool))) {
    return [];
  }
  const choices =
    city.fillRows === false
      ? []
      : admittedChoices(registry, city.pool, city.settlementKind, {
          along: city.blockX - 2 * city.pad,
          depth: cityRowDepth(city),
        });
  for (const lot of city.lots ?? []) {
    choices.push(...lotChoices(registry, city, lot));
  }
  if (city.ring) {
    choices.push(
      ...admittedChoices(registry, city.ring.pool, city.settlementKind, {
        along: Math.min(city.blockX, city.blockZ) - 2 * city.pad,
        depth: cityRowDepth(city),
      }),
    );
  }
  return choices.filter(({ weight, atMost }) => weight > 0 && atMost !== 0).map(({ ref }) => ref.id);
};

export const scenarioSources = (registry: Registry) => {
  const scenarios = [...registry.scenarios.values()];
  return {
    templates: scenarios.flatMap((scenario) => [
      scenario.serviceTemplate,
      ...scenarioBuildingSources(registry, scenario),
      ...(scenario.composition
        ? [
            scenario.composition.start.template,
            ...scenario.composition.leads.map((lead) => lead.template),
            ...scenario.composition.landmarks,
            ...scenario.composition.incidentalTemplates,
          ]
        : []),
    ]),
    fixedLoot: scenarios.flatMap((scenario) => [
      ...(scenario.composition?.fixedLoot ?? []),
      ...(scenario.composition?.leads.flatMap((lead) => lead.fixedLoot ?? []) ?? []),
    ]),
  };
};

export const composeScenario = (
  registry: Registry,
  scenario: ScenarioDef,
  service: Placement,
  { floor, start, lots = [] }: { floor: number; start: Placement; lots?: readonly PlannedLot[] },
): ScenarioComposition | undefined => {
  const authored = scenario.composition;
  if (!authored) {
    return undefined;
  }
  const placement = (id: string, origin: Vec3): Placement =>
    Object.freeze({
      template: compileTemplate(registry, registry.templates.get(id)!),
      origin: Object.freeze(origin) as Vec3,
      turn: 0,
    });
  const point = (local: Vec3): Readonly<Vec3> => Object.freeze(placedPoint(service, local));
  const pieces = placedPieces(service);
  const furnitureAnchor = (local: Vec3): Readonly<Vec3> => {
    const index = service.template.pieces.findIndex((piece) => piece.pos.join(',') === local.join(','));
    if (index < 0) {
      throw new Error(`Missing scenario furniture anchor ${local.join(',')}`);
    }
    return Object.freeze([...pieces[index]!.pos]) as Readonly<Vec3>;
  };
  const { city } = scenario;
  const side = Math.max(service.template.size[0], service.template.size[2]);
  const leadFaces: (Readonly<Vec3> | undefined)[] = [];
  const leads = Object.freeze(
    authored.leads.map((lead, index): Placement => {
      if (!lead.lot) {
        leadFaces.push(undefined);
        return placement(lead.template, [
          Math.floor(city.street / 2) + 1,
          floor,
          index === 0
            ? Math.floor(city.street / 2) + 1
            : -city.blocksZ * (city.street + city.blockZ) + Math.floor(city.street / 2) + 1,
        ]);
      }
      const parent = lots.find(({ definition }) => definition.id === lead.lot)?.placement;
      if (!(parent && lead.at && lead.standing)) {
        throw new Error(`Missing named lead lot "${lead.lot}" or its poses`);
      }
      const template = compileTemplate(registry, registry.templates.get(lead.template)!);
      const near = placedPoint(parent, lead.at);
      const far = placedPoint(parent, lead.at.map((value, axis) => value + template.size[axis]!) as Vec3);
      const origin = near.map((value, axis) => Math.min(value, far[axis]!)) as Vec3;
      leadFaces.push(Object.freeze(placedPoint(parent, lead.standing)));
      Object.freeze(origin);
      return Object.freeze({ template, origin, turn: parent.turn });
    }),
  );
  const landmarks = Object.freeze(
    authored.landmarks.map((id, index) =>
      placement(
        id,
        authored.landmarkPositions
          ? [
              authored.landmarkPositions[index]![0],
              floor + authored.landmarkPositions[index]![1],
              authored.landmarkPositions[index]![2],
            ]
          : [service.origin[0] + side + 4, floor, service.origin[2] + index * Math.floor(side / 2)],
      ),
    ),
  );
  const fixedLoot = authored.fixedLoot.map((source) => ({
    ...source,
    at: Object.freeze([...source.at]) as Vec3,
    items: source.items.map((item) =>
      Object.freeze({ ...item, ...(item.fitted ? { fitted: Object.freeze({ ...item.fitted }) } : {}) }),
    ),
  }));
  for (const source of fixedLoot) {
    Object.freeze(source.items);
    Object.freeze(source);
  }
  Object.freeze(fixedLoot);
  return Object.freeze({
    start: composeStart(authored.start, start),
    leads,
    leadFaces: Object.freeze(leadFaces),
    landmarks,
    lootSources: Object.freeze([
      Object.freeze({ placement: service, fixedLoot }),
      ...leads.map((lead, index) => Object.freeze({ placement: lead, fixedLoot: authored.leads[index]!.fixedLoot })),
    ]),
    objective: furnitureAnchor(authored.objective),
    objectiveFace: point(authored.objectiveFace),
    retreat: point(authored.retreat),
    resources: Object.freeze(
      authored.resources.map((resource) =>
        Object.freeze({ at: furnitureAnchor(resource.at), standing: point(resource.standing) }),
      ),
    ),
    storeys: Object.freeze(
      authored.storeys.map((storey) => Object.freeze({ id: storey.id, standing: point(storey.standing) })),
    ),
    descents: Object.freeze(
      authored.descents.map((descent) =>
        Object.freeze({
          ladder: furnitureAnchor(descent.ladder),
          upper: point(descent.upper),
          lower: point(descent.lower),
        }),
      ),
    ),
  });
};
