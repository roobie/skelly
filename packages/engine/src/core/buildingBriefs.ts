import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { BuildingBriefDef, KitRef, MapAssemblyDef } from './schema.ts';
import { eligibilityExclusion } from './settlementPools.ts';
import { templateEntranceEdges, templateReachesBeside, templateStandingRoute } from './templateSpatial.ts';
import {
  type CompiledTemplate,
  compileAssembly,
  compileMapPiece,
  kitSlotChoices,
  placedPieces,
  type Turn,
} from './templates.ts';

// Why each fit rule exists: `packages/deadvox/docs/building-pathway.md`, "Fit check".

interface BriefIssue {
  section: 'worldSettings' | 'buildingBriefs' | 'mapAssemblies';
  id: string;
  path: string;
  message: string;
}

type FitRule = 'plot' | 'storeys' | 'styles' | 'entrance' | 'program' | 'services';

type FitReport = (rule: FitRule, path: string, detail: string, choice?: string) => void;

/** The styles an assembly is placed in from outside: unstyled, and every ref elsewhere that names it with a style. */
const rootStyles = (registry: Registry, assembly: MapAssemblyDef): (string | undefined)[] => {
  const refs = [
    ...[...registry.mapPools.values()].flatMap((pool) => pool.choices.map(({ ref }) => ref)),
    ...[...registry.mapAssemblies.values()]
      .flatMap((outer) => outer.slots.flatMap((slot) => slot.choices ?? []))
      .map(({ ref }) => ref),
    ...[...registry.layouts.values()]
      .flatMap((layout) => layout.buildings)
      .map(({ template: id, style }) => ({ kind: 'assembly' as const, id, style })),
    ...[...registry.scenarios.values()]
      .flatMap((scenario) => (scenario.kind === 'composedSite' ? scenario.asks : []))
      .flatMap(({ template: id, style }) => (id === undefined ? [] : [{ kind: 'assembly' as const, id, style }])),
  ];
  const styled = refs.filter((ref) => ref.kind === 'assembly' && ref.id === assembly.id && ref.style !== undefined);
  return [undefined, ...new Set(styled.map(({ style }) => style))];
};

const styleLabel = (style: string | undefined): string => (style === undefined ? 'its own styles' : `style "${style}"`);

/**
 * Every piece style reachable under `assembly`, with the first slot path and variant that leads to it. Slots whose
 * choices do not resolve and nesting cycles are skipped here because the map kit check reports them.
 */
const pieceStyles = (registry: Registry, root: MapAssemblyDef, rootStyle: string | undefined): Map<string, string> => {
  const found = new Map<string, string>();
  const walk = (
    assembly: MapAssemblyDef,
    inherited: string | undefined,
    path: string,
    ancestors: readonly string[],
  ) => {
    if (ancestors.includes(assembly.id)) {
      return;
    }
    const visit = (slotId: string, ref: KitRef): void => {
      const at = `${path}/${slotId}=${ref.kind}:${ref.id}`;
      const style = ref.style ?? inherited;
      if (ref.kind === 'assembly') {
        const nested = registry.mapAssemblies.get(ref.id);
        if (nested) {
          walk(nested, style, at, [...ancestors, assembly.id]);
        }
        return;
      }
      const built = style ?? registry.mapPieces.get(ref.id)?.style;
      if (built !== undefined && !found.has(built)) {
        found.set(built, at);
      }
    };
    for (const slot of assembly.slots) {
      let choices: ReturnType<typeof kitSlotChoices>;
      try {
        choices = kitSlotChoices(registry, slot);
      } catch {
        continue;
      }
      for (const { ref } of choices) {
        visit(slot.id, ref);
      }
    }
    for (const join of assembly.joins) {
      visit(`seam_${join.id}`, { kind: 'piece', id: join.seam.piece });
    }
  };
  walk(root, rootStyle, root.id, []);
  return found;
};

/** The cheap rules, read from the assembly and its slot tree without compiling it. */
const declaredFitIssues = (
  registry: Registry,
  assembly: MapAssemblyDef,
  brief: BuildingBriefDef,
  report: FitReport,
): void => {
  for (const kind of brief.eligibility.settlementKinds) {
    const reason = eligibilityExclusion(registry, { kind: 'assembly', id: assembly.id }, kind, brief.plot);
    if (reason !== undefined) {
      report('plot', assembly.eligibility?.settlementKinds.includes(kind) ? '.size' : '.eligibility', reason);
    }
  }
  const storeys = assembly.access?.storeys.length ?? 0;
  const [fewest, most] = brief.storeys;
  if (storeys < fewest || storeys > most) {
    report('storeys', '.access.storeys', `declares ${storeys} storeys, outside ${fewest} to ${most}`);
  }
  styleFitIssues(registry, assembly, brief, report);
  for (const room of Object.keys(brief.program)) {
    if (assembly.anchors[room]?.kind !== 'standing') {
      report('program', `.anchors.${room}`, `room "${room}" has no standing anchor`);
    }
  }
};

const styleFitIssues = (
  registry: Registry,
  assembly: MapAssemblyDef,
  brief: BuildingBriefDef,
  report: FitReport,
): void => {
  for (const style of rootStyles(registry, assembly)) {
    for (const [built, at] of pieceStyles(registry, assembly, style)) {
      if (!brief.styles.includes(built)) {
        report('styles', '.slots', `builds in style "${built}"`, `${styleLabel(style)}, ${at}`);
      }
    }
  }
};

/**
 * The rules that need placed geometry. They walk reserved circulation only, which the slot contract keeps equal across
 * every variant (`templates.ts`, `resolveSlot`), so one compile per root style answers for every slot variant.
 */
const builtFitIssues = (
  registry: Registry,
  template: CompiledTemplate,
  brief: BuildingBriefDef,
  report: (rule: FitRule, path: string, detail: string) => void,
): void => {
  const { access } = template;
  if (!access) {
    report('entrance', '.access', 'declares no entrance');
    return;
  }
  // A city plan turns every building so its north edge at turn 0 faces the street; see
  // `packages/engine/src/core/cityPlan.ts`, `fillRow` and `SIDES`.
  if (!templateEntranceEdges(registry, template).has('n')) {
    report('entrance', '.access.entrance', 'entrance reaches no ground-storey opening on the street (north) edge');
  }
  for (const room of Object.keys(brief.program)) {
    const anchor = template.anchors?.[room];
    if (anchor?.kind === 'standing' && !templateStandingRoute(registry, template, access.entrance, anchor.at)) {
      report(
        'program',
        `.anchors.${room}`,
        `room "${room}" has no walk through reserved circulation from the entrance`,
      );
    }
  }
};

/** The services an answer must place: what its brief's rooms ask, and its setting's standards for its kinds and usage. */
const requiredServices = (registry: Registry, assembly: MapAssemblyDef, brief: BuildingBriefDef): string[] => {
  const standards = (registry.worldSettings.get(brief.setting)?.standards ?? []).filter(
    ({ settlementKind, usage }) =>
      brief.eligibility.settlementKinds.includes(settlementKind) && assembly.lootContext.usage.includes(usage),
  );
  return [
    ...new Set([
      ...Object.values(brief.program).flatMap(({ serves }) => serves ?? []),
      ...standards.flatMap(({ serves }) => serves),
    ]),
  ];
};

type Furniture = CompiledTemplate['pieces'][number];

/** One alternative a slot can be built as: a leaf piece's furniture in root coordinates, or a nested assembly's slots. */
interface Variant {
  readonly at: string;
  readonly pieces: readonly Furniture[];
  /** Each slot's alternatives. */
  readonly slots: readonly (readonly Variant[])[];
}

/** What the alternatives under one assembly compile with: the style it is built in and the fit check's piece cache. */
interface VariantContext {
  readonly registry: Registry;
  readonly style: string | undefined;
  readonly pieceCache: Map<string, CompiledTemplate>;
}

/**
 * Every alternative under `assembly`, slot by slot, with its furniture lifted into the root's coordinates. Called only
 * once the root has compiled in the context's style, which compiles every alternative, so none of them throws here.
 */
const slotVariants = (
  context: VariantContext,
  assembly: MapAssemblyDef,
  lift: (pieces: readonly Furniture[]) => Furniture[],
  path: string,
): Variant[][] => {
  const { registry, style, pieceCache } = context;
  const slots: { id: string; at: Vec3; turn: Turn; choices: { ref: KitRef }[] }[] = [
    ...assembly.slots.map((slot) => ({ ...slot, choices: kitSlotChoices(registry, slot) })),
    ...assembly.joins.map(({ id, seam }) => ({
      id: `seam_${id}`,
      at: seam.at,
      turn: seam.turn,
      choices: [{ ref: { kind: 'piece', id: seam.piece } as const }],
    })),
  ];
  return slots.map(({ id, at: origin, turn, choices }) =>
    choices.map(({ ref }): Variant => {
      const at = `${path}/${id}=${ref.kind}:${ref.id}`;
      const inner = ref.style ?? style;
      const place = (size: Vec3, pieces: readonly Furniture[]) =>
        lift(placedPieces({ template: { size, pieces }, origin, turn }));
      if (ref.kind === 'assembly') {
        const nested = registry.mapAssemblies.get(ref.id)!;
        return {
          at,
          pieces: [],
          slots: slotVariants({ ...context, style: inner }, nested, (pieces) => place(nested.size, pieces), at),
        };
      }
      const piece = compileMapPiece(registry, registry.mapPieces.get(ref.id)!, {
        seed: 0,
        siteId: `fit:${path}`,
        pieceCache,
        ...(inner === undefined ? {} : { style: inner }),
      });
      return { at, pieces: place(piece.size, piece.pieces), slots: [] };
    }),
  );
};

/** Whether `variant` places a fitting piece in every draw: itself, or through one slot whose every alternative does. */
const guarantees = (variant: Variant, fits: (piece: Furniture) => boolean): boolean =>
  variant.pieces.some(fits) || variant.slots.some((choices) => choices.every((choice) => guarantees(choice, fits)));

const everyPiece = (variant: Variant): Furniture[] => [
  ...variant.pieces,
  ...variant.slots.flat().flatMap((choice) => everyPiece(choice)),
];

/** The first alternative that drops a fitting piece its sibling alternatives place. */
const lackingVariant = (variant: Variant, fits: (piece: Furniture) => boolean): string | undefined => {
  for (const choices of variant.slots) {
    const missing = choices.find((choice) => !guarantees(choice, fits));
    if (missing && choices.some((choice) => guarantees(choice, fits))) {
      return missing.at;
    }
    for (const choice of choices) {
      const found = lackingVariant(choice, fits);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
};

/**
 * Each required service has a piece serving it, beside a walk from the entrance, in every draw. The walk is the
 * reserved-circulation reach `builtFitIssues` relies on, equal across variants, so only the furniture is read per variant.
 */
const serviceFitIssues = (
  context: VariantContext,
  assembly: MapAssemblyDef,
  template: CompiledTemplate,
  services: readonly string[],
): { detail: string; choice: string }[] => {
  if (services.length === 0) {
    return [];
  }
  const { registry, style } = context;
  const root = {
    at: assembly.id,
    pieces: [],
    slots: slotVariants(context, assembly, (pieces) => [...pieces], assembly.id),
  };
  const beside = templateReachesBeside(registry, template);
  const placed = everyPiece(root);
  return services.flatMap((service) => {
    const serving = (piece: Furniture) => registry.furniture.get(piece.furniture)?.serves?.includes(service) === true;
    const reached = (piece: Furniture) => serving(piece) && beside(piece);
    if (guarantees(root, reached)) {
      return [];
    }
    if (!placed.some(serving)) {
      return [{ detail: `no piece serves "${service}" in any slot variant`, choice: styleLabel(style) }];
    }
    if (!placed.some(reached)) {
      return [
        {
          detail: `no piece serving "${service}" stands beside a walk from the entrance through reserved circulation`,
          choice: styleLabel(style),
        },
      ];
    }
    const lacking = lackingVariant(root, reached);
    return [
      {
        detail: `no one slot places a reachable piece serving "${service}" in every variant`,
        choice: lacking === undefined ? styleLabel(style) : `${styleLabel(style)}, ${lacking}`,
      },
    ];
  });
};

/** Whether `assembly` answers `brief` in every style it can be placed in and with every slot variant. */
const assemblyFitIssues = (registry: Registry, assembly: MapAssemblyDef, brief: BuildingBriefDef): BriefIssue[] => {
  const issues: BriefIssue[] = [];
  const report: FitReport = (rule, path, detail, choice) =>
    issues.push({
      section: 'mapAssemblies',
      id: assembly.id,
      path,
      message: `assembly "${assembly.id}" breaks the ${rule} rule of brief "${brief.id}"${choice ? ` with ${choice}` : ''}: ${detail}`,
    });
  declaredFitIssues(registry, assembly, brief, report);
  const services = requiredServices(registry, assembly, brief);
  const pieceCache = new Map<string, CompiledTemplate>();
  for (const style of rootStyles(registry, assembly)) {
    let template: CompiledTemplate;
    try {
      template = compileAssembly(registry, assembly, {
        seed: 0,
        siteId: `fit:${assembly.id}`,
        pieceCache,
        ...(style === undefined ? {} : { style }),
      });
    } catch (error) {
      // The map kit check reports an assembly that does not compile in its own styles.
      if (style !== undefined) {
        report(
          'styles',
          '',
          `does not compile: ${error instanceof Error ? error.message : String(error)}`,
          styleLabel(style),
        );
      }
      continue;
    }
    builtFitIssues(registry, template, brief, (rule, path, detail) =>
      report(rule, path, detail, `${styleLabel(style)}, every slot variant`),
    );
    for (const { detail, choice } of serviceFitIssues({ registry, style, pieceCache }, assembly, template, services)) {
      report('services', '.slots', detail, choice);
    }
  }
  return issues;
};

/**
 * A setting's standards and a brief's setting, tags, settlement kinds, styles and services resolve, an assembly's brief
 * exists, and an assembly fits the brief it names. A service resolves when some furniture serves it.
 */
export const buildingBriefIssues = (registry: Registry): BriefIssue[] => {
  const issues: BriefIssue[] = [];
  const served = new Set([...registry.furniture.values()].flatMap(({ serves }) => serves ?? []));
  const unserved = (
    services: readonly string[] | undefined,
    at: string,
    report: (path: string, message: string) => void,
  ) =>
    services?.forEach((service, index) => {
      if (!served.has(service)) {
        report(`${at}[${index}]`, `no furniture serves "${service}"`);
      }
    });
  for (const setting of registry.worldSettings.values()) {
    const report = (path: string, message: string) =>
      issues.push({ section: 'worldSettings', id: setting.id, path, message });
    setting.standards?.forEach(({ settlementKind, serves }, index) => {
      if (!setting.settlementKinds.includes(settlementKind)) {
        report(
          `.standards[${index}].settlementKind`,
          `world setting "${setting.id}" has no settlement kind "${settlementKind}"`,
        );
      }
      unserved(serves, `.standards[${index}].serves`, report);
    });
  }
  for (const brief of registry.buildingBriefs.values()) {
    const report = (path: string, message: string) =>
      issues.push({ section: 'buildingBriefs', id: brief.id, path, message });
    const setting = registry.worldSettings.get(brief.setting);
    if (!setting) {
      report('.setting', `no world setting "${brief.setting}"`);
    }
    brief.eligibility.settlementKinds.forEach((kind, index) => {
      if (setting && !setting.settlementKinds.includes(kind)) {
        report(
          `.eligibility.settlementKinds[${index}]`,
          `world setting "${setting.id}" has no settlement kind "${kind}"`,
        );
      }
    });
    brief.styles.forEach((style, index) => {
      if (!registry.mapStyles.has(style)) {
        report(`.styles[${index}]`, `no map style "${style}"`);
      }
    });
    brief.tags.forEach((tag, index) => {
      if (setting && !Object.hasOwn(setting.tags, tag)) {
        report(`.tags[${index}]`, `world setting "${setting.id}" has no tag "${tag}"`);
      }
    });
    for (const [room, { serves }] of Object.entries(brief.program)) {
      unserved(serves, `.program.${room}.serves`, report);
    }
  }
  for (const assembly of registry.mapAssemblies.values()) {
    if (assembly.brief === undefined) {
      continue;
    }
    const brief = registry.buildingBriefs.get(assembly.brief);
    issues.push(
      ...(brief
        ? assemblyFitIssues(registry, assembly, brief)
        : [
            {
              section: 'mapAssemblies' as const,
              id: assembly.id,
              path: '.brief',
              message: `no building brief "${assembly.brief}"`,
            },
          ]),
    );
  }
  return issues;
};
