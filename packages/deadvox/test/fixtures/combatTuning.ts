import type { Registry } from '../../../engine/src/content.ts';
import { claimed } from '../../../engine/src/inventory.ts';
import { firearmsCombatTuning } from '../../../engine/src/sim.ts';

export const skilledFirearmsTuning = (registry: Registry) => {
  const skill = claimed(registry.skills, 'firearmsCombat');
  const effects = skill?.combat?.firearms;
  if (!(effects && skill?.curve)) {
    throw new Error('Fixture needs a complete firearms skill');
  }
  const tuning = firearmsCombatTuning(registry);
  return { ...tuning, ...effects, curve: skill.curve, breathHold: { ...tuning.breathHold, ...effects.breathHold } };
};
