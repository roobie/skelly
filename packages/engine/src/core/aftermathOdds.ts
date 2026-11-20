// Aftermath odds: per-tag multipliers on the weights of slot alternatives that show a non-default condition.
// See `packages/deadvox/docs/aftermath.md`, "Aftermath odds".
import type { Registry } from './content.ts';
import type { KitRef } from './schema.ts';

export type AftermathOdds = Readonly<Record<string, number>>;

/** Odds with an inner scope's tags laid over the outer scope's, so the innermost setting wins per tag. */
export const innerAftermathOdds = (
  outer: AftermathOdds | undefined,
  inner: AftermathOdds | undefined,
): AftermathOdds | undefined => (inner ? { ...outer, ...inner } : outer);

/**
 * The tags a slot alternative shows: its own definition's and those of the style its ref names. A style the slot
 * inherits is the same for every alternative, so it cannot tell them apart and is left out.
 */
const aftermathTagsOf = (registry: Registry, ref: KitRef): ReadonlySet<string> => {
  const target = ref.kind === 'piece' ? registry.mapPieces.get(ref.id) : registry.mapAssemblies.get(ref.id);
  const style = ref.style === undefined ? undefined : registry.mapStyles.get(ref.style);
  return new Set([...(target?.aftermath ?? []), ...(style?.aftermath ?? [])]);
};

/** A slot alternative's weight under the odds in force; 0 leaves it out of the draw. */
export const aftermathWeight = (
  registry: Registry,
  { ref, weight }: { ref: KitRef; weight: number },
  odds: AftermathOdds | undefined,
): number => {
  if (!odds) {
    return weight;
  }
  let scaled = weight;
  for (const tag of aftermathTagsOf(registry, ref)) {
    scaled *= odds[tag] ?? 1;
  }
  return scaled;
};

type AftermathSection = 'mapStyles' | 'mapPieces' | 'mapAssemblies' | 'layouts' | 'scenarios';

export interface AftermathIssue {
  readonly section: AftermathSection;
  readonly id: string;
  readonly path: string;
  readonly message: string;
}

/** Every tag a definition shows and every tag a scope sets odds for must name a declared aftermath tag. */
export const aftermathIssues = (registry: Registry): AftermathIssue[] => {
  const issues: AftermathIssue[] = [];
  const known = (section: AftermathSection, id: string, path: string, tags: readonly string[] | undefined) => {
    for (const tag of tags ?? []) {
      if (!registry.aftermathTags.has(tag)) {
        issues.push({ section, id, path, message: `no aftermath tag "${tag}"` });
      }
    }
  };
  const oddsKnown = (section: AftermathSection, id: string, path: string, odds: AftermathOdds | undefined) =>
    known(section, id, path, odds && Object.keys(odds));
  for (const style of registry.mapStyles.values()) {
    known('mapStyles', style.id, '.aftermath', style.aftermath);
  }
  for (const piece of registry.mapPieces.values()) {
    known('mapPieces', piece.id, '.aftermath', piece.aftermath);
  }
  for (const assembly of registry.mapAssemblies.values()) {
    known('mapAssemblies', assembly.id, '.aftermath', assembly.aftermath);
    oddsKnown('mapAssemblies', assembly.id, '.aftermathOdds', assembly.aftermathOdds);
  }
  for (const layout of registry.layouts.values()) {
    oddsKnown('layouts', layout.id, '.aftermathOdds', layout.aftermathOdds);
    for (const [index, building] of layout.buildings.entries()) {
      oddsKnown('layouts', layout.id, `.buildings[${index}].aftermathOdds`, building.aftermathOdds);
    }
  }
  for (const scenario of registry.scenarios.values()) {
    oddsKnown('scenarios', scenario.id, '.aftermathOdds', scenario.aftermathOdds);
  }
  return issues;
};
