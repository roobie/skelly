import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';

export const graphicsTuningOf = (registry: Pick<Registry, 'graphics'>) => {
  const tuning = registry.graphics.get(CORE_CONTENT_IDS.coreGraphics);
  if (tuning === undefined) {
    throw new Error(`content does not define graphics tuning "${CORE_CONTENT_IDS.coreGraphics}"`);
  }
  return tuning;
};
