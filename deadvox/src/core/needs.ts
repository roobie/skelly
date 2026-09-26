// The player's body (DESIGN.md, "Character"): needs in percent changing at rates
// per game hour, health as a single pool, and stamina, which is spent and got back
// by the second. Needs and health move in straight lines between thresholds (a need
// running out, or dropping low enough to stop health coming back), so `stepNeeds`
// advances exactly from one threshold to the next: a step of many hours lands where
// ticking every second would. That is what catch-up and compressed time rely on.

export interface Needs {
  /** 100 is full. */
  calories: number;
  /** 100 is fully hydrated. */
  hydration: number;
  /** 0 is rested, 100 is exhausted. */
  fatigue: number;
  /** 100 is unhurt; at 0 you die. */
  health: number;
  /** 100 is fresh; sprinting spends it. */
  stamina: number;
}

export type Need = 'calories' | 'hydration' | 'fatigue';

/** Change per game hour while awake. */
export const NEED_RATES: Readonly<Record<Need, number>> = { calories: -3, hydration: -5, fatigue: 4 };

/** Health per game hour (SLICE-1.md, "Tunables"). */
export const HEALTH = {
  /** Coming back while calories and hydration are at least `metAbove` and fatigue is at most `restedBelow`. */
  regen: 2,
  metAbove: 25,
  restedBelow: 80,
  /** Lost while starving (calories at 0) and while dehydrated (hydration at 0); both add up. */
  starving: -4,
  dehydrated: -8,
} as const;

/** Stamina per second of simulation time. */
export const STAMINA = {
  sprint: -5,
  recover: 4,
  /** Recovery is halved when you're exhausted, starving or parched (see CRITICAL). */
  worn: 0.5,
  /** Below this you're winded and can't start sprinting. */
  winded: 10,
} as const;

/** Slice 1 spawns hungry, thirsty and tired (SLICE-1.md, "Tunables"). */
export const SPAWN_NEEDS: Readonly<Needs> = { calories: 40, hydration: 35, fatigue: 70, health: 100, stamina: 100 };

/** 100% calories is this many kilocalories, and 100% hydration this many millilitres. */
export const FULL = { kcal: 2500, ml: 2500 } as const;

/** Crossing one of these interrupts a long action. */
const CRITICAL: readonly { need: keyof Needs; below?: number; above?: number; message: string }[] = [
  { need: 'calories', below: 10, message: "You're starving" },
  { need: 'hydration', below: 10, message: "You're parched" },
  { need: 'fatigue', above: 90, message: "You're exhausted" },
  { need: 'health', below: 25, message: "You're badly hurt" },
];

const clamp = (v: number): number => Math.min(100, Math.max(0, v));

const isCritical = (needs: Needs, rule: (typeof CRITICAL)[number]): boolean =>
  (rule.below !== undefined && needs[rule.need] < rule.below) ||
  (rule.above !== undefined && needs[rule.need] > rule.above);

/** Health's rate per game hour for the needs as they are now. */
export const healthRate = (needs: Needs): number => {
  let rate = 0;
  if (needs.calories <= 0) {
    rate += HEALTH.starving;
  }
  if (needs.hydration <= 0) {
    rate += HEALTH.dehydrated;
  }
  const met =
    needs.calories >= HEALTH.metAbove && needs.hydration >= HEALTH.metAbove && needs.fatigue <= HEALTH.restedBelow;
  if (rate < 0) {
    return rate;
  }
  return met && needs.health < 100 ? HEALTH.regen : 0;
};

/** What's draining health right now, for the death screen. */
export const causeOf = (needs: Needs): string | undefined => {
  const causes = [needs.hydration <= 0 ? 'thirst' : '', needs.calories <= 0 ? 'hunger' : ''].filter(Boolean);
  return causes.length > 0 ? causes.join(' and ') : undefined;
};

/** Hours until a value moving at `rate` per hour reaches `level`, if it's heading there. */
const hoursTo = (value: number, rate: number, level: number): number => {
  const h = (level - value) / rate;
  return rate !== 0 && h > 1e-12 ? h : Number.POSITIVE_INFINITY;
};

/** The levels where a rate changes: a need emptying or filling, or health's conditions. */
const LEVELS: readonly [Need, number][] = [
  ['calories', 0],
  ['calories', HEALTH.metAbove],
  ['hydration', 0],
  ['hydration', HEALTH.metAbove],
  ['fatigue', HEALTH.restedBelow],
  ['fatigue', 100],
];

/** Hours until the next level. */
const nextBreak = (needs: Needs, health: number): number => {
  const times = LEVELS.map(([need, level]) => hoursTo(needs[need], NEED_RATES[need], level));
  return Math.min(...times, hoursTo(needs.health, health, 0), hoursTo(needs.health, health, 100));
};

/** Puts a value that has just reached a level exactly on it, so rounding can't carry it past unnoticed. */
const snap = (needs: Needs): void => {
  for (const [need, level] of LEVELS) {
    if (Math.abs(needs[need] - level) < 1e-9) {
      needs[need] = level;
    }
  }
  for (const level of [0, 100]) {
    if (Math.abs(needs.health - level) < 1e-9) {
      needs.health = level;
    }
  }
};

/**
 * Health's rate over the stretch that starts now: judged a moment ahead, so a need
 * sitting exactly on a threshold counts as the side it's heading to.
 */
const segmentRate = (needs: Needs): number => {
  const ahead = { ...needs };
  for (const need of Object.keys(NEED_RATES) as Need[]) {
    ahead[need] = clamp(needs[need] + NEED_RATES[need] * 1e-6);
  }
  return healthRate(ahead);
};

/**
 * Advances needs and health by `hours` game hours, in place, exactly: the step is
 * split wherever a rate changes. Returns the messages for needs that became critical
 * during the step. Stamina isn't touched; it moves by the second (`stepStamina`).
 */
export const stepNeeds = (needs: Needs, hours: number): string[] => {
  const before = { ...needs };
  let left = hours;
  while (left > 0 && needs.health > 0) {
    const health = segmentRate(needs);
    const h = Math.min(left, nextBreak(needs, health));
    for (const need of Object.keys(NEED_RATES) as Need[]) {
      needs[need] = clamp(needs[need] + NEED_RATES[need] * h);
    }
    needs.health = clamp(needs.health + health * h);
    snap(needs);
    left -= h;
  }
  return CRITICAL.filter((rule) => !isCritical(before, rule) && isCritical(needs, rule)).map((rule) => rule.message);
};

/** Stamina recovers at half speed when you're worn down. */
const worn = (needs: Needs): boolean => needs.fatigue > 90 || needs.calories < 10 || needs.hydration < 10;

/** Spends or recovers stamina over `seconds` of simulation time, in place. */
export const stepStamina = (needs: Needs, seconds: number, sprinting: boolean): void => {
  const rate = sprinting ? STAMINA.sprint : STAMINA.recover * (worn(needs) ? STAMINA.worn : 1);
  needs.stamina = clamp(needs.stamina + rate * seconds);
};

/** Whether you can sprint: not while winded, and once winded, not until you've got some breath back. */
export const canSprint = (needs: Needs, sprinting: boolean): boolean =>
  sprinting ? needs.stamina > 0 : needs.stamina >= STAMINA.winded;

/** What eating or drinking something gives, in percent. */
export const nourishment = (food: { calories: number; water: number }): { calories: number; hydration: number } => ({
  calories: (food.calories / FULL.kcal) * 100,
  hydration: (food.water / FULL.ml) * 100,
});

/** Health lost to eating something rotten, which gives nothing else (the caller hurts you with it). */
export const FOOD_POISONING = 15;

/** Eats or drinks something that isn't rotten, in place. */
export const consume = (needs: Needs, food: { calories: number; water: number }): void => {
  const gain = nourishment(food);
  needs.calories = clamp(needs.calories + gain.calories);
  needs.hydration = clamp(needs.hydration + gain.hydration);
};
