import type { ContentIssue, Registry } from './content.ts';

export const CONTENT_CAPABILITIES = {
  body: ['player'],
  compression: ['player'],
  figures: ['player'],
  handlingRange: ['testRange'],
  inventory: ['player'],
  meleeClasses: ['unarmed'],
  saves: ['autosave'],
  senses: ['player'],
  player: ['player'],
  siteGeneration: ['authoredSite'],
  skillProgression: ['progression'],
  skills: ['firearmsCombat', 'meleeCombat', 'inventoryManagement', 'crafting'],
  ui: ['interface'],
  graphics: ['graphics'],
  look: ['defaultLook'],
  powerTuning: ['power'],
  weathering: ['defaultWeathering'],
} as const;

interface Claimant {
  id: string;
  capability?: string | undefined;
}

const claimants = <T extends Claimant>(entries: ReadonlyMap<string, T>, capability: string): T[] =>
  [...entries.values()].filter((entry) => entry.capability === capability);

export const claimed = <T extends Claimant>(entries: ReadonlyMap<string, T>, capability: string): T | undefined => {
  const providers = claimants(entries, capability);
  if (providers.length > 1) {
    throw new Error(`competing claimants for capability "${capability}": ${providers.map(({ id }) => id).join(', ')}`);
  }
  return providers[0];
};

export const claimedId = <T extends Claimant>(entries: ReadonlyMap<string, T>, capability: string): string => {
  const provider = claimed(entries, capability);
  if (!provider) {
    throw new Error(`missing required capability "${capability}"`);
  }
  return provider.id;
};

export const capabilityIssues = (registry: Registry, requireAll = true): ContentIssue[] => {
  const issues: ContentIssue[] = [];
  for (const [section, capabilities] of Object.entries(CONTENT_CAPABILITIES)) {
    const entries = registry[section as keyof typeof CONTENT_CAPABILITIES] as ReadonlyMap<string, Claimant>;
    for (const capability of capabilities) {
      const providers = claimants(entries, capability);
      if (providers.length === 0 && (!requireAll || capability === 'crafting')) {
        continue;
      }
      if (providers.length !== 1) {
        issues.push({
          source: 'core content',
          path: section,
          message:
            providers.length === 0
              ? `missing required capability "${capability}"`
              : `competing claimants for capability "${capability}": ${providers.map(({ id }) => id).join(', ')}`,
        });
      }
    }
  }
  return issues;
};
