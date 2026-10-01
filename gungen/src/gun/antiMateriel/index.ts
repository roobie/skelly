// The anti-materiel vocabulary (docs/anti-materiel.md): families and rules. parts.ts and domain.ts each
// register these with one line, so the rest of the work stays in this folder.

import type { PartFamily, Rule } from '../../core/schema.ts';
import { barrelShroud } from './barrelShroud.ts';
import { bipod } from './bipod.ts';
import { carryHandle } from './carryHandle.ts';
import { heavyLower } from './heavyLower.ts';
import { heavyMagazine } from './heavyMagazine.ts';
import { heavyReceiver } from './heavyReceiver.ts';
import { monopod } from './monopod.ts';
import { muzzleBrake } from './muzzleBrake.ts';
import { recoilStock } from './recoilStock.ts';
import { bipodGroundClearance, shroudFit } from './rules.ts';

export const ANTI_MATERIEL_FAMILIES: Readonly<Record<string, PartFamily>> = {
  'muzzle-brake': muzzleBrake,
  'barrel-shroud': barrelShroud,
  bipod,
  'carry-handle': carryHandle,
  'recoil-stock': recoilStock,
  monopod,
  'heavy-receiver': heavyReceiver,
  'heavy-lower': heavyLower,
  'heavy-magazine': heavyMagazine,
};

export const ANTI_MATERIEL_RULES: readonly Rule[] = [shroudFit, bipodGroundClearance];
