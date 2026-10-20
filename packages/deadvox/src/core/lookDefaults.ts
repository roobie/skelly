// The default look is content (the `look` section, validated by core/schema.ts), not a code constant,
// so a mod can change how the game looks with no URL parameters.

import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { LookDefaults } from './mood.ts';

export const lookDefaultsOf = (registry: Pick<Registry, 'look'>): LookDefaults => {
  const { id: _id, ...defaults } = registry.look.get(CORE_CONTENT_IDS.coreLook) ?? missing();
  return defaults;
};

const missing = (): never => {
  throw new Error(`content does not define the default look "${CORE_CONTENT_IDS.coreLook}"`);
};
