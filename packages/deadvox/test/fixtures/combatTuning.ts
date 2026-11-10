import type { Registry } from '@skelly/engine/content';
import { claimed } from '@skelly/engine/inventory';
import { firearmsCombatTuning } from '@skelly/engine/sim';

export const skilledFirearmsTuning = (registry: Registry) => {
  const skill = claimed(registry.skills, 'firearmsCombat');
  const effects = skill?.combat?.firearms;
  if (!(effects && skill?.curve)) {
    throw new Error('Fixture needs a complete firearms skill');
  }
  const tuning = firearmsCombatTuning(registry);
  return { ...tuning, ...effects, curve: skill.curve, breathHold: { ...tuning.breathHold, ...effects.breathHold } };
};
