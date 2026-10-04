// One admission boundary for startup URL discovery and world construction. Raw JSON is never a registry.
import { buildRegistry, type ContentSource } from '../core/content.ts';

const files = import.meta.glob<unknown>('../content/base/*.json', { eager: true, import: 'default' });
const sources: ContentSource[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([source, data]) => ({ source, data }));

/** Whole-file shape/reference rejection and surviving content are shared by every startup consumer. */
export const BUNDLED_CONTENT = buildRegistry(sources);
