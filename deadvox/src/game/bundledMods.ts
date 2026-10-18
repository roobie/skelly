import bundledModList from '../config/bundled-mods.json' with { type: 'json' };
import { bundledModCatalogue } from '../core/bundledModCatalogue.ts';
import type { ContentIssue } from '../core/content.ts';
import { type BrowserMod, evaluateMods } from './browserMods.ts';
import { baseSources, type StartupContent } from './bundledContent.ts';

/** Each factor multiplies the base value of one stat for every hostile kind. */
export const BEGINNER_FACTORS = { damage: 0.5, speed: 0.5, detection: 0.5, health: 0.5 } as const;

interface Row {
  id: string;
  attack: { moves: { damage: number }[] };
  speed: { wanderMetresPerSimSecond: number; chaseMetresPerSimSecond: number };
  sight: number;
  nightSight: number;
  hearing: number;
  lightSightScale?: number;
  regions: Record<string, number>;
}
type Factors = Readonly<Record<keyof typeof BEGINNER_FACTORS, number>>;

/** Builds a mod's data from the base sources, so base tuning changes carry through. */
type Derive = (base: readonly { data: unknown }[]) => Record<string, unknown>;

interface BundledMod {
  id: string;
  derive: Derive;
}

const baseRows = (base: readonly { data: unknown }[], section: string): Row[] => {
  const rows = new Map<string, Row>();
  for (const { data } of base) {
    const list = (data as Record<string, unknown> | undefined)?.[section];
    for (const row of Array.isArray(list) ? (list as Row[]) : []) {
      rows.set(row.id, row);
    }
  }
  return [...rows.values()];
};

const scaleHostile = (row: Row, factors: Factors): Row => {
  const out = structuredClone(row);
  for (const move of out.attack.moves) {
    move.damage *= factors.damage;
  }
  out.speed.wanderMetresPerSimSecond *= factors.speed;
  out.speed.chaseMetresPerSimSecond *= factors.speed;
  out.sight *= factors.detection;
  out.nightSight *= factors.detection;
  out.hearing *= factors.detection;
  out.lightSightScale = (out.lightSightScale ?? 1) * factors.detection;
  out.regions = Object.fromEntries(Object.entries(out.regions).map(([region, hp]) => [region, hp * factors.health]));
  return out;
};

const DERIVATIONS: Readonly<Record<string, Derive>> = {
  beginner: (base) => ({
    id: 'beginner',
    zombies: baseRows(base, 'zombies').map((row) => scaleHostile(row, BEGINNER_FACTORS)),
  }),
};

// The list is content so the site launcher reads the same file; an entry with no derivation is an error.
const BUNDLED_MODS: readonly BundledMod[] = bundledModCatalogue(bundledModList).map(({ id }) => {
  const derive = Object.hasOwn(DERIVATIONS, id) ? DERIVATIONS[id] : undefined;
  if (!derive) {
    throw new Error(`Bundled mod "${id}" has no derivation`);
  }
  return { id, derive };
});

export const bundledModIdsFromUrl = (params: URLSearchParams): string[] => {
  const value = params.get('mods');
  if (value === null || value === '1') {
    return [];
  }
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

export interface BundledSelection {
  content: StartupContent;
  /** Data of each admitted bundled mod, for the save identity. */
  admitted: { id: string; data: Record<string, unknown> }[];
  issues: ContentIssue[];
}

/** Admits the named bundled mods through the same intake as player mods; unknown ids are issues. */
export const selectBundledMods = (
  ids: readonly string[],
  base: readonly { data: unknown }[] = baseSources,
): BundledSelection => {
  const issues: ContentIssue[] = [];
  const mods: BrowserMod[] = [];
  const admitted: BundledSelection['admitted'] = [];
  for (const id of ids) {
    const found = BUNDLED_MODS.find((mod) => mod.id === id);
    const source = `mods=${id}`;
    if (!found) {
      issues.push({
        source,
        path: 'id',
        message: `Unknown bundled mod "${id}"; available: ${BUNDLED_MODS.map((mod) => mod.id).join(', ')}`,
      });
      continue;
    }
    const data = found.derive(base);
    admitted.push({ id, data });
    mods.push({ source, text: JSON.stringify(data), enabled: true });
  }
  const result = evaluateMods(mods);
  for (const list of result.issues.values()) {
    issues.push(...list);
  }
  return { content: result.content, admitted, issues };
};
