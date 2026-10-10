// Needs change in percent per game hour; stamina is spent and recovered by the
// second. `stepNeeds` advances exactly across need thresholds so catch-up and
// compressed time land where ticking every second would. Health belongs to Body.

export interface Needs {
  /** 100 is full. */
  calories: number;
  /** 100 is fully hydrated. */
  hydration: number;
  /** 0 is rested, 100 is exhausted. */
  fatigue: number;
  /** 100 is fresh; sprinting spends it. */
  stamina: number;
  /** Simulation-time delay remaining before stamina can recover after reaching zero. */
  staminaRegenDelayRemainingSimSeconds: number;
}

export type Need = 'calories' | 'hydration' | 'fatigue';

/** Change per game hour while awake; resting or sleeping overrides fatigue's rate (see REST). */
export const NEED_RATES: Readonly<Record<Need, number>> = { calories: -3, hydration: -5, fatigue: 4 };

export const REST = {
  rest: -15,
  sleep: -30,
  bedBonus: -20,
} as const;

const HEALTH = {
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

export const SPAWN_NEEDS: Readonly<Needs> = {
  calories: 40,
  hydration: 35,
  fatigue: 70,
  stamina: 100,
  staminaRegenDelayRemainingSimSeconds: 0,
};

/** 100% calories is this many kilocalories, and 100% hydration this many millilitres. */
const FULL = { kcal: 2500, ml: 2500 } as const;

/** Crossing one of these interrupts a long action. */
const CRITICAL: readonly { need: Need; below?: number; above?: number; message: string }[] = [
  { need: 'calories', below: 10, message: "You're starving" },
  { need: 'hydration', below: 10, message: "You're parched" },
  { need: 'fatigue', above: 90, message: "You're exhausted" },
];

const clamp = (v: number): number => Math.min(100, Math.max(0, v));

const isCritical = (needs: Needs, rule: (typeof CRITICAL)[number]): boolean =>
  (rule.below !== undefined && needs[rule.need] < rule.below) ||
  (rule.above !== undefined && needs[rule.need] > rule.above);

/** The recovery rate per game hour when the needs are met. */
const healthRegenRate = (needs: Needs): number => {
  const met =
    needs.calories >= HEALTH.metAbove && needs.hydration >= HEALTH.metAbove && needs.fatigue <= HEALTH.restedBelow;
  return met ? HEALTH.regen : 0;
};

/** Health's rate per game hour for the needs and health as they are now. */
const healthRate = (needs: Needs, health: number): number => {
  let rate = 0;
  if (needs.calories <= 0) {
    rate += HEALTH.starving;
  }
  if (needs.hydration <= 0) {
    rate += HEALTH.dehydrated;
  }
  if (rate < 0) {
    return rate;
  }
  return health < 100 ? healthRegenRate(needs) : 0;
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
const nextBreak = (
  needs: Needs,
  bodyHealth: number,
  healthRatePerHour: number,
  rates: Readonly<Record<Need, number>>,
): number => {
  const times = LEVELS.map(([need, level]) => hoursTo(needs[need], rates[need], level));
  return Math.min(...times, hoursTo(bodyHealth, healthRatePerHour, 0), hoursTo(bodyHealth, healthRatePerHour, 100));
};

/** Puts a value that has just reached a level exactly on it, so rounding can't carry it past unnoticed. */
const snap = (needs: Needs): void => {
  for (const [need, level] of LEVELS) {
    if (Math.abs(needs[need] - level) < 1e-9) {
      needs[need] = level;
    }
  }
};

/**
 * Health's rate over the stretch that starts now: judged a moment ahead, so a need
 * sitting exactly on a threshold counts as the side it's heading to.
 */
const segmentRates = (
  needs: Needs,
  health: number,
  rates: Readonly<Record<Need, number>>,
): { health: number; regionRecovery: number } => {
  const ahead = { ...needs };
  for (const need of Object.keys(NEED_RATES) as Need[]) {
    ahead[need] = clamp(needs[need] + rates[need] * 1e-6);
  }
  return { health: healthRate(ahead, health), regionRecovery: healthRegenRate(ahead) };
};

/**
 * Advances needs, health and eligible regional recovery by `hours` game hours, in
 * place, exactly: the step is split wherever a rate changes. Returns the messages for needs that became critical
 * during the step. `damageImmune` suppresses health loss while preserving need decay
 * and recovery. `rates` overrides the per-hour rates (resting and sleeping use it for
 * fatigue; see REST). Stamina isn't touched; it moves by the second (`stepStamina`).
 */
export interface HealthPool {
  readonly health: number;
  damageHealth: (amount: number) => number;
  restoreHealth: (amount: number) => void;
  recoverRegionDamage: (ratePerGameHour: number, gameHours: number, elapsedGameHours: number) => void;
}

export interface StepNeedsOptions {
  damageImmune?: boolean;
  rates?: Readonly<Record<Need, number>>;
}

export const stepNeeds = (
  needs: Needs,
  body: HealthPool,
  hours: number,
  { damageImmune = false, rates = NEED_RATES }: StepNeedsOptions = {},
): string[] => {
  const before = { ...needs };
  const beforeHealth = body.health;
  let left = hours;
  let elapsedGameHours = 0;
  while (left > 0 && body.health > 0) {
    const segment = segmentRates(needs, body.health, rates);
    const healthRatePerHour = damageImmune ? Math.max(0, segment.health) : segment.health;
    const h = Math.min(left, nextBreak(needs, body.health, healthRatePerHour, rates));
    for (const need of Object.keys(NEED_RATES) as Need[]) {
      needs[need] = clamp(needs[need] + rates[need] * h);
    }
    const healthChange = healthRatePerHour * h;
    if (segment.regionRecovery > 0) {
      body.recoverRegionDamage(segment.regionRecovery, h, elapsedGameHours);
    }
    if (healthChange < 0) {
      body.damageHealth(-healthChange);
    } else {
      body.restoreHealth(healthChange);
    }
    snap(needs);
    elapsedGameHours += h;
    left -= h;
  }
  const messages = CRITICAL.filter((rule) => !isCritical(before, rule) && isCritical(needs, rule)).map(
    (rule) => rule.message,
  );
  if (beforeHealth >= 25 && body.health < 25) {
    messages.push("You're badly hurt");
  }
  return messages;
};

/** Stamina recovers at half speed when you're worn down. */
const worn = (needs: Needs): boolean => needs.fatigue > 90 || needs.calories < 10 || needs.hydration < 10;

/** Spends stamina and starts its authored recovery delay on the transition to empty. */
export const spendStamina = (
  needs: Pick<Needs, 'stamina' | 'staminaRegenDelayRemainingSimSeconds'>,
  amount: number,
  staminaRegenDelaySimSeconds: number,
): void => {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isFinite(staminaRegenDelaySimSeconds) ||
    staminaRegenDelaySimSeconds < 0
  ) {
    throw new Error('Invalid stamina spend');
  }
  const before = needs.stamina;
  needs.stamina = clamp(needs.stamina - amount);
  if (before > 0 && needs.stamina === 0) {
    needs.staminaRegenDelayRemainingSimSeconds = staminaRegenDelaySimSeconds;
  }
};

/** Spends or recovers stamina over `seconds` of simulation time, in place. */
export const stepStamina = (
  needs: Needs,
  seconds: number,
  sprinting: boolean,
  staminaRegenDelaySimSeconds = 0,
): void => {
  if (
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    !Number.isFinite(staminaRegenDelaySimSeconds) ||
    staminaRegenDelaySimSeconds < 0
  ) {
    throw new Error('Invalid stamina step');
  }
  if (sprinting) {
    spendStamina(needs, -STAMINA.sprint * seconds, staminaRegenDelaySimSeconds);
    return;
  }
  let recoverySeconds = seconds;
  if (needs.stamina === 0 && needs.staminaRegenDelayRemainingSimSeconds > 0) {
    const waiting = Math.min(recoverySeconds, needs.staminaRegenDelayRemainingSimSeconds);
    needs.staminaRegenDelayRemainingSimSeconds -= waiting;
    recoverySeconds -= waiting;
  }
  if (recoverySeconds > 0) {
    needs.stamina = clamp(needs.stamina + STAMINA.recover * (worn(needs) ? STAMINA.worn : 1) * recoverySeconds);
  }
};

/** Whether you can sprint: not while winded, and once winded, not until you've got some breath back. */
export const canSprint = (needs: Needs, sprinting: boolean): boolean =>
  sprinting ? needs.stamina > 0 : needs.stamina >= STAMINA.winded;

/** What eating or drinking something gives, in percent. */
const nourishment = (food: { calories: number; water: number }): { calories: number; hydration: number } => ({
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
