import type { BodyRegion, DamageKind, Touch } from './body.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { BodyTuningDef } from './schema.ts';

/** The worn item a hit on the region meets first (`DESIGN.md`, "Worn coverage"). */
const wornItemMet = (
  inventory: Inventory,
  tuning: BodyTuningDef,
  region: BodyRegion,
  touch?: Touch,
): Item | undefined => {
  const slots = tuning.coverage[region];
  const first = touch && tuning.touchFirst[touch];
  const touched = first && slots.includes(first) ? inventory.worn[first] : undefined;
  return touched ?? slots.map((slot) => inventory.worn[slot]).find((item) => item !== undefined);
};

const imperviousTo = (inventory: Inventory, item: Item | undefined, kind: DamageKind): boolean =>
  item !== undefined && (defOf(inventory.registry, item.type).wearable?.imperviousTo?.includes(kind) ?? false);

export interface PlayerHit {
  readonly region: BodyRegion;
  readonly damage: number;
  readonly kind: DamageKind;
  readonly touch?: Touch | undefined;
}

export const wearOnPlayerHit = (
  inventory: Inventory,
  tuning: BodyTuningDef,
  { region, damage, kind, touch }: PlayerHit,
): void => {
  const item = wornItemMet(inventory, tuning, region, touch);
  if (!item || imperviousTo(inventory, item, kind)) {
    return;
  }
  const rate = defOf(inventory.registry, item.type).wearable?.wearPerDamage;
  if (rate !== undefined) {
    inventory.changeCondition(item.uid, -rate * damage * tuning.outerWearMultiplier[kind]);
  }
};

/** The player's worn items as the simulation's impact hooks, so every caller wires wear the same way. */
export const playerWearHooks = (inventory: Inventory, tuning: BodyTuningDef) => ({
  onImpact: (damage: number, region: BodyRegion, kind: DamageKind, touch?: Touch) =>
    wearOnPlayerHit(inventory, tuning, { region, damage, kind, touch }),
  impervious: (region: BodyRegion, kind: DamageKind, touch?: Touch) =>
    imperviousTo(inventory, wornItemMet(inventory, tuning, region, touch), kind),
  protectionShare: (region: BodyRegion, kind: DamageKind, touch?: Touch) => {
    const item = wornItemMet(inventory, tuning, region, touch);
    return item && item.condition > 0 ? (defOf(inventory.registry, item.type).wearable?.protects?.[kind] ?? 0) : 0;
  },
});

export const wearMeleeWeaponOnHit = (inventory: Inventory, uid: number): void => {
  const item = inventory.itemByUid(uid);
  const rate = item && defOf(inventory.registry, item.type).weapon?.melee?.wearPerHit;
  if (item && rate !== undefined) {
    inventory.changeCondition(uid, -rate);
  }
};
