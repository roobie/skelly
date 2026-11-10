import type { Registry } from '../../src/engine/content.ts';
import { claimed } from '../../src/engine/inventory.ts';
import { firearmsCombatTuning } from '../../src/engine/sim.ts';

export const skilledFirearmsTuning = (registry: Registry) => {
  const skill = claimed(registry.skills, 'firearmsCombat');
  const effects = skill?.combat?.firearms;
  if (!(effects && skill?.curve)) {
    throw new Error('Fixture needs a complete firearms skill');
  }
  const tuning = firearmsCombatTuning(registry);
  return { ...tuning, ...effects, curve: skill.curve, breathHold: { ...tuning.breathHold, ...effects.breathHold } };
};
