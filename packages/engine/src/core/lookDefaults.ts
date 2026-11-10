// The default look is content (the `look` section, validated by core/schema.ts), not a code constant,
// so a mod can change how the game looks with no URL parameters.

import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';
import type { LookDefaults } from './mood.ts';

export const lookDefaultsOf = (registry: Pick<Registry, 'look'>): LookDefaults => {
  const { id: _id, capability: _capability, ...defaults } = claimed(registry.look, 'defaultLook') ?? missing();
  return defaults;
};

const missing = (): never => {
  throw new Error('missing required capability "defaultLook"');
};
