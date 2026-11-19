import type { Registry } from './content.ts';
import type { BuildingBriefDef, KitRef, MapAssemblyDef } from './schema.ts';
import { eligibilityExclusion } from './settlementPools.ts';
import { templateEntranceEdges, templateStandingRoute } from './templateSpatial.ts';
import { type CompiledTemplate, compileAssembly, kitSlotChoices } from './templates.ts';

// Why each fit rule exists: `packages/deadvox/docs/building-pathway.md`, "Fit check".

interface BriefIssue {
  section: 'buildingBriefs' | 'mapAssemblies';
  id: string;
  path: string;
  message: string;
}

type FitRule = 'plot' | 'storeys' | 'styles' | 'entrance' | 'program';

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
  }
  return issues;
};

/**
 * A brief's setting, settlement kinds and styles resolve, an assembly's brief exists, and an assembly fits the brief
 * it names.
 */
export const buildingBriefIssues = (registry: Registry): BriefIssue[] => {
  const issues: BriefIssue[] = [];
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
