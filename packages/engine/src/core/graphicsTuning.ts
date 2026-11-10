import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';

export const graphicsTuningOf = (registry: Pick<Registry, 'graphics'>) => {
  const tuning = claimed(registry.graphics, 'graphics');
  if (tuning === undefined) {
    throw new Error('missing required capability "graphics"');
  }
  return tuning;
};
