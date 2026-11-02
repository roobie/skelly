import type { ContentIssue, Registry } from './content.ts';
import { registrySection } from './registrySection.ts';

export const CONTENT_CAPABILITIES = {
  actors: { settlementHorde: 'optional', settlementWanderer: 'optional' },
  body: { player: 'required' },
  compression: { player: 'required' },
  figures: { player: 'required' },
  handlingRange: { testRange: 'required' },
  inventory: { player: 'required' },
  meleeClasses: { unarmed: 'required' },
  saves: { autosave: 'required' },
  senses: { player: 'required' },
  player: { player: 'required' },
  siteGeneration: { authoredSite: 'required' },
  skillProgression: { progression: 'required' },
  skills: {
    firearmsCombat: 'required',
    meleeCombat: 'required',
    inventoryManagement: 'required',
    crafting: 'optional',
  },
  ui: { interface: 'required' },
  graphics: { graphics: 'required' },
  look: { defaultLook: 'required' },
  powerTuning: { power: 'required' },
  weathering: { defaultWeathering: 'required' },
} as const;

interface Claimant {
  id: string;
  capability?: string | readonly string[] | undefined;
}

const claimants = <T extends Claimant>(entries: ReadonlyMap<string, T>, capability: string): T[] =>
  [...entries.values()].filter((entry) =>
    typeof entry.capability === 'string' ? entry.capability === capability : entry.capability?.includes(capability),
  );

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
    const entries = registry[registrySection(section as keyof typeof CONTENT_CAPABILITIES)] as ReadonlyMap<
      string,
      Claimant
    >;
    for (const [capability, requirement] of Object.entries(capabilities)) {
      const providers = claimants(entries, capability);
      if (providers.length === 0 && (!requireAll || requirement === 'optional')) {
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
