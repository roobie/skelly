import process from 'node:process';
import { buildRegistry, type ContentSource, type Registry } from '@skelly/engine/content';
import { admitPacks } from '@skelly/engine/packs';
import { readBundledPacks } from '../tools/readBundledPacks.ts';
import { startupContentSources } from './baseContentFiles.ts';

export const wearSlotsLookRegistry = (extra: readonly ContentSource[] = []): Registry => {
  const admitted = admitPacks(readBundledPacks(process.cwd(), 'skelly.deadvox.scenario.test-house.wear-slots-look'));
  if (admitted.issues.length > 0) {
    throw new Error(`Wear-slot look pack admission failed: ${JSON.stringify(admitted.issues)}`);
  }
  const built = buildRegistry([...startupContentSources(), ...admitted.sources, ...extra]);
  if (built.issues.length > 0) {
    throw new Error(`Wear-slot look registry failed: ${JSON.stringify(built.issues)}`);
  }
  return built.registry;
};
