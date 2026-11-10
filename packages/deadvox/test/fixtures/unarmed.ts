import { readFileSync } from 'node:fs';
import type { MeleeWeapon } from '../../../engine/src/core/actorSystem.ts';
import type { MeleeClassDef } from '../../../engine/src/core/content.ts';
import { unarmedMeleeWeapon } from '../../src/game/melee.ts';

const baseMeleeClasses = (): ReadonlyMap<string, MeleeClassDef> => {
  const { meleeClasses } = JSON.parse(readFileSync('../mods/skelly.melee-classes/melee-classes.json', 'utf8')) as {
    meleeClasses: MeleeClassDef[];
  };
  return new Map(meleeClasses.map((meleeClass) => [meleeClass.id, meleeClass]));
};

/** The bare-handed attack as base content authors it, so no test restates its tuning; the unarmed class sets every optional field. */
export const FISTS_MELEE = unarmedMeleeWeapon(baseMeleeClasses()) as MeleeWeapon & {
  readonly impulse: number;
  readonly contactFraction: number;
  readonly windupCapSimSeconds: number;
};
