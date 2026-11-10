import type { StartDef } from '../core/schema/starts.ts';
import type { StartupContent } from './bundledContent.ts';

/**
 * The start a run begins from: the start mod's row, else the default the last admitted pack names, so a scenario
 * loaded through `mods` comes before the product entry pack. Why: `packages/deadvox/docs/url-mods.md`, "Start mod".
 */
export const runStartId = (content: StartupContent): string | undefined =>
  content.startModStart ?? content.defaultStart;

export const requireStart = (content: StartupContent, id: string | undefined, debug = false): StartDef => {
  const start = id === undefined ? undefined : content.registry.starts.get(id);
  if (!start || (start.debugOnly && !debug)) {
    throw new Error(`No admitted playable start "${id ?? '(entry default missing)'}"`);
  }
  return start;
};

export const startForSite = (content: StartupContent, site: string, debug = false): StartDef => {
  const starts = [...content.registry.starts.values()].filter(
    (start) => start.defaultForSite && start.site === site && (!start.debugOnly || debug),
  );
  if (starts.length !== 1) {
    throw new Error(`Site "${site}" requires one authored default start`);
  }
  return starts[0]!;
};
