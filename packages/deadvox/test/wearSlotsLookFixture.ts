import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import type { ContentSource, Registry } from '@skelly/engine/content';
import { inject } from 'vitest';
import { overlayContent } from './baseRegistry.ts';

export const wearSlotsLookRegistry = (extra: readonly ContentSource[] = []): Registry => {
  // Full pack admission/validation is shared; UI/render/save cases need isolated snapshots, not repeated builds.
  const registry = deserialize(readFileSync(inject('wearSlotsLookRegistryPath'))) as Registry;
  return overlayContent(registry, extra);
};
