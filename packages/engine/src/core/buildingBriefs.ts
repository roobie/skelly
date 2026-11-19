import { boardableDoor } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { BuildingBriefDef, KitRef, MapAssemblyDef } from './schema.ts';
import { eligibilityExclusion } from './settlementPools.ts';
import { ownershipCell } from './templateOwnership.ts';
import { templateEntranceEdges, templateReachesBeside, templateStandingRouteBeside } from './templateSpatial.ts';
import {
  type CompiledTemplate,
  cellsOf,
  compileAssembly,
  compileMapPiece,
  kitSlotChoices,
  placedCell,
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

type FitRule = 'plot' | 'storeys' | 'styles' | 'doorways' | 'entrance' | 'program' | 'services';

/** Whether a walk may cross a cell beyond reserved circulation. */
type Free = (cell: Vec3) => boolean;

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
      .map(({ template: id, style }) => ({ kind: 'assembly' as const, id, style })),
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
 * The rules that need placed geometry. They walk reserved circulation and doorways only, which the slot contract and
 * the doorway contract keep passable across every variant (`templates.ts`, `resolveSlot`; `doorwayBlock`), so one
 * compile per root style answers for every slot variant.
 */
const builtFitIssues = (
  registry: Registry,
  { template, doorway }: Built,
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
  if (!templateEntranceEdges(registry, template, doorway).has('n')) {
    report('entrance', '.access.entrance', 'entrance reaches no ground-storey opening on the street (north) edge');
  }
  const route = templateStandingRouteBeside(registry, template, doorway);
  for (const room of Object.keys(brief.program)) {
    const anchor = template.anchors?.[room];
    if (anchor?.kind === 'standing' && !route(access.entrance, anchor.at)) {
      report(
        'program',
        `.anchors.${room}`,
        `room "${room}" has no walk through reserved circulation and doorways from the entrance`,
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

/** Where one level of the slot tree sits in the level around it. */
interface Frame {
  readonly size: Vec3;
  readonly origin: Vec3;
  readonly turn: Turn;
}

/**
 * One alternative a slot can be built as: a leaf piece's furniture and claimed cells in root coordinates, or a nested
 * assembly's slots.
 */
interface Variant {
  readonly at: string;
  readonly pieces: readonly Furniture[];
  /** The cells a leaf piece claims; none for an assembly, whose slots claim them. */
  readonly owned: readonly Vec3[];
  /** Each slot's alternatives. */
  readonly slots: readonly (readonly Variant[])[];
  /** Set on an alternative of a doorway slot, whose claimed cells a walk may cross. */
  readonly doorway?: { readonly blocked: string | undefined };
}

/**
 * Why a doorway alternative may not leave its slot passable, or undefined when it must: every cell is claimed, so no
 * other slot builds into it, none is solid, and the only furniture is a door leaf that opens. A locked leaf passes,
 * because a lock is the door working as built; a boarded or barred one does not, because boards close the way.
 */
const doorwayBlock = (registry: Registry, piece: CompiledTemplate): string | undefined => {
  const cells = [...cellsOf(piece.size)];
  const at = (index: number) => `[${cells[index]!.join(',')}]`;
  const unclaimed = piece.ownership!.indexOf(0);
  if (unclaimed !== -1) {
    return `leaves cell ${at(unclaimed)} unclaimed`;
  }
  const solid = piece.blocks.findIndex((block) => registry.blocks[block]?.solid === true);
  if (solid !== -1) {
    return `fills cell ${at(solid)} with a solid block`;
  }
  const stop = piece.pieces.find(({ furniture, boarding }) => {
    const def = registry.furniture.get(furniture);
    return !(def && boardableDoor(def)) || boarding !== undefined;
  });
  if (stop === undefined) {
    return undefined;
  }
  return stop.boarding
    ? `boards its door "${stop.furniture}" shut`
    : `holds "${stop.furniture}", which is not a door leaf that opens`;
};

/** What the alternatives under one assembly compile with: the style it is built in and the fit check's piece cache. */
interface VariantContext {
  readonly registry: Registry;
  readonly style: string | undefined;
  readonly pieceCache: Map<string, CompiledTemplate>;
}

/**
 * Every alternative under `assembly`, slot by slot, lifted through `frames`, innermost first, into the root's
 * coordinates. Called only once the root has compiled in the context's style, which compiles every alternative, so none
 * of them throws here.
 */
const slotVariants = (
  context: VariantContext,
  assembly: MapAssemblyDef,
  frames: readonly Frame[],
  path: string,
): Variant[][] => {
  const { registry, style, pieceCache } = context;
  const slots: { id: string; at: Vec3; turn: Turn; choices: { ref: KitRef }[]; doorway?: true | undefined }[] = [
    ...assembly.slots.map((slot) => ({ ...slot, choices: kitSlotChoices(registry, slot) })),
    ...assembly.joins.map(({ id, seam }) => ({
      id: `seam_${id}`,
      at: seam.at,
      turn: seam.turn,
      choices: [{ ref: { kind: 'piece', id: seam.piece } as const }],
    })),
  ];
  return slots.map(({ id, at: origin, turn, choices, doorway }) =>
    choices.map(({ ref }): Variant => {
      const at = `${path}/${id}=${ref.kind}:${ref.id}`;
      const inner = ref.style ?? style;
      const placed = (size: Vec3): Frame[] => [{ size, origin, turn }, ...frames];
      if (ref.kind === 'assembly') {
        const nested = registry.mapAssemblies.get(ref.id)!;
        return {
          at,
          pieces: [],
          owned: [],
          slots: slotVariants({ ...context, style: inner }, nested, placed(nested.size), at),
          ...(doorway ? { doorway: { blocked: 'builds an assembly, not a door piece' } } : {}),
        };
      }
      const piece = compileMapPiece(registry, registry.mapPieces.get(ref.id)!, {
        seed: 0,
        siteId: `fit:${path}`,
        pieceCache,
        ...(inner === undefined ? {} : { style: inner }),
      });
      const lift = placed(piece.size);
      return {
        at,
        pieces: lift.reduce<Furniture[]>(
          (pieces, frame) =>
            placedPieces({ template: { size: frame.size, pieces }, origin: frame.origin, turn: frame.turn }),
          [...piece.pieces],
        ),
        owned: [...cellsOf(piece.size)]
          .filter((_, index) => (piece.ownership?.[index] ?? 0) !== 0)
          .map((cell) => lift.reduce((lifted, frame) => placedCell(frame, lifted), cell)),
        slots: [],
        ...(doorway ? { doorway: { blocked: doorwayBlock(registry, piece) } } : {}),
      };
    }),
  );
};

/** Every alternative under `variant`, at any depth. */
const everyChoice = (variant: Variant): Variant[] =>
  variant.slots.flat().flatMap((choice) => [choice, ...everyChoice(choice)]);

/** A root compile and the doorway cells its walks may cross. */
interface Built {
  readonly template: CompiledTemplate;
  readonly doorway: Free;
}

/**
 * The cells every doorway slot under `root` claims, after reporting each alternative that may not leave its slot
 * passable. A blocked alternative's cells still count, so the walks report only what the doorway report does not.
 */
const doorways = (
  template: CompiledTemplate,
  root: Variant,
  report: (detail: string, choice: string) => void,
): Free => {
  const choices = everyChoice(root).flatMap(({ at, owned, doorway }) => (doorway ? [{ at, owned, doorway }] : []));
  for (const { at, doorway } of choices) {
    if (doorway.blocked !== undefined) {
      report(`a doorway alternative ${doorway.blocked}`, at);
    }
  }
  const crossed = new Set(choices.flatMap(({ owned }) => owned.map((cell) => ownershipCell(template.size, cell))));
  return (cell) => crossed.has(ownershipCell(template.size, cell));
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

/** Each leaf alternative with the pieces of every other slot's alternatives, any of which a draw may place beside it. */
const leafVariants = (root: Variant): { variant: Variant; foreign: Furniture[] }[] => {
  const all = everyPiece(root);
  const walk = (variant: Variant): { variant: Variant; foreign: Furniture[] }[] =>
    variant.slots.flatMap((choices) => {
      const own = new Set(choices.flatMap(everyPiece));
      const foreign = all.filter((piece) => !own.has(piece));
      return [
        ...choices.filter((choice) => choice.slots.length === 0).map((choice) => ({ variant: choice, foreign })),
        ...choices.flatMap(walk),
      ];
    });
  return walk(root);
};

/**
 * Whether a body can stand beside a box in every draw of `variant`, walking from the entrance through reserved
 * circulation, doorways and the floor the variant leaves free in the cells its own piece claims. Its own doors stand
 * outside any doorway contract, so they are not free. Every other slot's alternatives stand in at once, so no cell one
 * of them covers or stands over is free, whatever they draw; in reserved cells the slot contract keeps them equal
 * across draws, and in doorways the doorway contract keeps them passable.
 */
const variantReach = (
  registry: Registry,
  { template, doorway }: Built,
  variant: Variant,
  foreign: readonly Furniture[],
): ((piece: Furniture) => boolean) => {
  const [sx, , sz] = template.size;
  const index = ([x, y, z]: Vec3) => x + sx * (z + sz * y);
  const owned = new Set(variant.owned.map(index));
  const taken = new Set(
    [...foreign, ...variant.pieces.filter((piece) => registry.furniture.get(piece.furniture)?.door)].flatMap(
      ({ pos, size }) =>
        [...cellsOf(size)].map((offset) => index(offset.map((value, axis) => value + pos[axis]!) as Vec3)),
    ),
  );
  const free = (cell: Vec3) =>
    doorway(cell) ||
    (owned.has(index(cell)) && !taken.has(index(cell)) && !taken.has(index([cell[0], cell[1] - 1, cell[2]])));
  return templateReachesBeside(registry, { ...template, pieces: [...variant.pieces, ...foreign] }, free);
};

/**
 * Each required service has a piece serving it, beside a walk from the entrance, in every draw. Furniture is what
 * variants may change, so each leaf alternative that places a serving piece gets its own walk (`variantReach`).
 */
const serviceFitIssues = (
  context: VariantContext,
  root: Variant,
  built: Built,
  services: readonly string[],
): { detail: string; choice: string }[] => {
  if (services.length === 0) {
    return [];
  }
  const { registry, style } = context;
  const serves = (piece: Furniture, service: string) =>
    registry.furniture.get(piece.furniture)?.serves?.includes(service) === true;
  const beside = new Set<Furniture>();
  for (const { variant, foreign } of leafVariants(root)) {
    const fixtures = variant.pieces.filter((piece) => services.some((service) => serves(piece, service)));
    if (fixtures.length > 0) {
      const reaches = variantReach(registry, built, variant, foreign);
      for (const piece of fixtures.filter(reaches)) {
        beside.add(piece);
      }
    }
  }
  const placed = everyPiece(root);
  return services.flatMap((service) => {
    const serving = (piece: Furniture) => serves(piece, service);
    const reached = (piece: Furniture) => serving(piece) && beside.has(piece);
    if (guarantees(root, reached)) {
      return [];
    }
    if (!placed.some(serving)) {
      return [{ detail: `no piece serves "${service}" in any slot variant`, choice: styleLabel(style) }];
    }
    if (!placed.some(reached)) {
      return [
        {
          detail: `no piece serving "${service}" stands beside a walk from the entrance through reserved circulation, doorways and its own variant's free floor`,
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
    const context = { registry, style, pieceCache };
    const root: Variant = {
      at: assembly.id,
      pieces: [],
      owned: [],
      slots: slotVariants(context, assembly, [], assembly.id),
    };
    const built: Built = {
      template,
      doorway: doorways(template, root, (detail, choice) =>
        report('doorways', '.slots', detail, `${styleLabel(style)}, ${choice}`),
      ),
    };
    builtFitIssues(registry, built, brief, (rule, path, detail) =>
      report(rule, path, detail, `${styleLabel(style)}, every slot variant`),
    );
    for (const { detail, choice } of serviceFitIssues(context, root, built, services)) {
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
