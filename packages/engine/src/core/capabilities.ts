import type { ContentIssue, Registry } from './content.ts';

export const CONTENT_CAPABILITIES = {
  actors: { settlementHorde: 'optional', settlementWanderer: 'optional' },
  body: { player: 'required' },
  compression: { player: 'required' },
  figures: { player: 'required' },
  inventory: { player: 'required' },
  meleeClasses: { unarmed: 'required' },
  saves: { autosave: 'required' },
  senses: { player: 'required' },
  player: { player: 'required' },
  siteGeneration: { authoredSite: 'optional' },
  skillProgression: { progression: 'optional' },
  rangedTuning: { ranged: 'optional' },
  combatPolicy: { player: 'optional' },
  skills: {
    firearmsCombat: 'optional',
    meleeCombat: 'optional',
    inventoryManagement: 'optional',
    crafting: 'optional',
    mechanics: 'optional',
    longGunSteadiness: 'optional',
  },
  ui: { interface: 'required' },
  cursors: { gameCursor: 'required' },
  graphics: { graphics: 'required' },
  look: { defaultLook: 'required' },
  powerTuning: { power: 'optional' },
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

const requiredForStack = (registry: Registry, section: string, requirement: string): boolean =>
  requirement === 'required' ||
  (section === 'skillProgression' && registry.skills.size > 0) ||
  (section === 'powerTuning' && registry.powerDevices.size > 0) ||
  (section === 'siteGeneration' && registry.starts.size + registry.layouts.size + registry.scenarios.size > 0);

export const capabilityIssues = (registry: Registry, requireAll = true): ContentIssue[] => {
  const issues: ContentIssue[] = [];
  for (const [section, capabilities] of Object.entries(CONTENT_CAPABILITIES)) {
    const entries = registry[section as keyof typeof CONTENT_CAPABILITIES] as ReadonlyMap<string, Claimant>;
    for (const [capability, requirement] of Object.entries(capabilities)) {
      const providers = claimants(entries, capability);
      if (providers.length === 0 && !(requireAll && requiredForStack(registry, section, requirement))) {
        continue;
      }
      if (providers.length !== 1) {
        issues.push({
          source: 'core content',
          path: section,
          message:
            providers.length === 0
              ? `missing required capability "${capability}"`
              : `competing claimants for capability "${capability}": ${providers
                  .map(({ id }) => `${id} (${registry.contentOrigins.get(`${section}:${id}`)?.source ?? 'unknown source'})`)
                  .join(', ')}; a pack that depends on the owner takes over by declaring an override of the owner's entry, otherwise remove one claim`,
        });
      }
    }
  }
  return issues;
};
