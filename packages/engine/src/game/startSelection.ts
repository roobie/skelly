import type { StartDef } from '../core/schema/starts.ts';
import type { StartupContent } from './bundledContent.ts';

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
