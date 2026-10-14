import { buildRegistry, type ContentSource } from '../core/content.ts';

const files = import.meta.glob<unknown>('../content/base/*.json', { eager: true, import: 'default' });
const sources: ContentSource[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([source, data]) => ({ source, data }));

export type StartupContent = ReturnType<typeof buildRegistry>;

export const buildBundledContent = (mods: readonly ContentSource[] = []): StartupContent =>
  buildRegistry([...sources, ...mods]);
