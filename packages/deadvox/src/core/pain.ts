// Pain: the body's report of injury, kept apart from health, region damage and shock (`DESIGN.md`, "Pain").
// `Body` owns the state and composes these pieces; everything here is pure arithmetic over it.

import type { BodyTuningDef, ItemDef } from './schema.ts';

type PainTuning = BodyTuningDef['pain'];
type PainEffectTuning = PainTuning['aimSway'];
export type PainTierDef = PainTuning['tiers'][number];
export type AnalgesicDef = NonNullable<ItemDef['analgesic']>;
/** The analgesic an item type carries, if any; a body reads its doses' curves through this. */
export type AnalgesicLookup = (item: string) => AnalgesicDef | undefined;

/** One dose taken, aged in Game seconds until its relief has faded. */
export interface PainDose {
  item: string;
  elapsedGameSeconds: number;
}

/** Acute pain is the only pain the body stores; background pain is read from the injuries themselves. */
export interface PainState {
  acute: number;
  doses: PainDose[];
}

/** How pain changes what the player does: multipliers that are 1 below the first tier. */
export interface PainEffects {
  aimSway: number;
  handlingSlowdown: number;
}

export interface PainReading {
  /** Felt pain: open-ended, with the knockout threshold as its balance point. */
  felt: number;
  /** Acute pain stored by the body. */
  acute: number;
  /** Background pain derived from injuries. */
  injuries: number;
  /** Relief currently supplied by painkiller doses. */
  relief: number;
  /** Felt pain as a share of the knockout threshold. */
  ratio: number;
  /** The index of the tier felt pain is in, or undefined below the first. */
  tier: number | undefined;
  effects: PainEffects;
}

/**
 * Acute pain after `seconds` of fading by `flat` plus `share` of itself per Sim second. The closed form keeps a long
 * compressed step and many short ones in agreement.
 */
export const fadeAcute = (acute: number, seconds: number, flat: number, share: number): number => {
  if (acute <= 0 || seconds <= 0) {
    return Math.max(0, acute);
  }
  if (share <= 0) {
    return Math.max(0, acute - flat * seconds);
  }
  const offset = flat / share;
  return Math.max(0, (acute + offset) * Math.exp(-share * seconds) - offset);
};

/** Game seconds from taking a dose until its relief is gone. */
export const doseLasts = (def: AnalgesicDef): number =>
  def.onsetGameMinutes + def.peakGameMinutes + def.fadeGameMinutes;

/**
 * One dose's relief at an age: it rises through the onset, holds at its peak, then falls through the fade. A phase of
 * zero length is skipped, so no onset starts at the peak and no fade drops straight to nothing.
 */
const doseRelief = (def: AnalgesicDef, elapsedGameSeconds: number): number => {
  const { reliefPerDose: peak, onsetGameMinutes: onset, peakGameMinutes: hold, fadeGameMinutes: fade } = def;
  if (elapsedGameSeconds < onset) {
    return peak * (elapsedGameSeconds / onset);
  }
  const fading = elapsedGameSeconds - onset - hold;
  if (fading < 0) {
    return peak;
  }
  return fading < fade ? peak * (1 - fading / fade) : 0;
};

/**
 * All doses' relief together. Doses in one group add up to no more than the group's cap, the highest `maxRelief` among
 * them, so repeat doses cannot stack relief without limit; another group's doses add on top.
 */
export const analgesia = (doses: readonly PainDose[], lookup: AnalgesicLookup): number => {
  const groups = new Map<string, { relief: number; cap: number }>();
  for (const { item, elapsedGameSeconds } of doses) {
    const def = lookup(item)!;
    const key = def.group ?? item;
    const group = groups.get(key) ?? { relief: 0, cap: 0 };
    group.relief += doseRelief(def, elapsedGameSeconds);
    group.cap = Math.max(group.cap, def.maxRelief);
    groups.set(key, group);
  }
  let total = 0;
  for (const { relief, cap } of groups.values()) {
    total += Math.min(relief, cap);
  }
  return total;
};

/**
 * The drug vignette from all doses: each dose's `vignette` scaled by its relief as a share of its peak, so it rises
 * and fades with the drug. Capped at full; it changes only the picture, never pain or its effects.
 */
export const drugVignette = (doses: readonly PainDose[], lookup: AnalgesicLookup): number => {
  let total = 0;
  for (const { item, elapsedGameSeconds } of doses) {
    const def = lookup(item)!;
    if (def.vignette !== undefined) {
      total += def.vignette * (doseRelief(def, elapsedGameSeconds) / def.reliefPerDose);
    }
  }
  return Math.min(1, total);
};

/** Doses aged by `gameSeconds`, without those whose relief has faded, so the saved list stays short. */
export const ageDoses = (doses: readonly PainDose[], gameSeconds: number, lookup: AnalgesicLookup): PainDose[] =>
  doses
    .map((dose) => ({ ...dose, elapsedGameSeconds: dose.elapsedGameSeconds + gameSeconds }))
    .filter((dose) => dose.elapsedGameSeconds < doseLasts(lookup(dose.item)!));

/** The index of the last tier a ratio reaches, or undefined below the first. */
export const painTier = (ratio: number, tiers: readonly PainTierDef[]): number | undefined => {
  let found: number | undefined;
  for (const [index, tier] of tiers.entries()) {
    if (ratio >= tier.from) {
      found = index;
    }
  }
  return found;
};

const effect = ({ perShare, max }: PainEffectTuning, excess: number): number => 1 + Math.min(max, perShare * excess);

/** Pain's own effects, growing with the ratio above the first tier's start; below it, nothing changes. */
export const painEffects = (ratio: number, tuning: PainTuning): PainEffects => {
  const excess = Math.max(0, ratio - tuning.tiers[0]!.from);
  return { aimSway: effect(tuning.aimSway, excess), handlingSlowdown: effect(tuning.handlingSlowdown, excess) };
};
