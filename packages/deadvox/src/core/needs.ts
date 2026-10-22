// Needs change per game hour; stamina is spent and recovered by the second.
// `stepNeeds` advances exactly across need thresholds so catch-up and compressed
// time land where ticking every second would. Health belongs to Body.

export interface Needs {
  /** 100 is full. */
  calories: number;
  /** 100 is fully hydrated. */
  hydration: number;
  /** Sleep debt: 0 is rested, 100 is what a normal sleep clears, and it has no upper cap. */
  fatigue: number;
  /** 100 is fresh; sprinting spends it. */
  stamina: number;
  /** Simulation-time delay remaining before stamina can recover after reaching zero. */
  staminaRegenDelayRemainingSimSeconds: number;
}

export type Need = 'calories' | 'hydration' | 'fatigue';

const NEEDS: readonly Need[] = ['calories', 'hydration', 'fatigue'];

/** Awake or asleep: each has its own fatigue ceiling for recovery in body content. */
export type RecoveryState = 'awake' | 'asleep';

/** Crossing one makes a need critical: it interrupts a long action and wears stamina recovery. */
export interface CriticalRule {
  readonly need: Need;
  readonly below?: number | undefined;
  readonly above?: number | undefined;
  readonly message: string;
}

/** Stamina's content, per second of simulation time, as the stamina steps read it. */
export interface StaminaRules {
  readonly sprintPerSimSecond: number;
  readonly recoverPerSimSecond: number;
  readonly wornRecoveryFactor: number;
  readonly windedBelow: number;
  readonly critical: readonly CriticalRule[];
}

/** 100% calories is this many kilocalories, and 100% hydration this many millilitres. */
export interface NourishmentScale {
  readonly kcal: number;
  readonly ml: number;
}

export const clamp = (v: number): number => Math.min(100, Math.max(0, v));

/** Fatigue is sleep debt and only has a floor; the other needs run from 0 to 100. */
const bound = (need: Need, v: number): number => (need === 'fatigue' ? Math.max(0, v) : clamp(v));

const isCritical = (needs: Needs, rule: CriticalRule): boolean =>
  (rule.below !== undefined && needs[rule.need] < rule.below) ||
  (rule.above !== undefined && needs[rule.need] > rule.above);

type NeedsFloor = Readonly<{ calories: number; hydration: number }>;

/** Health lost per game hour at the empty end of calories and of hydration; both add up. */
type HealthLoss = Readonly<{ starving: number; dehydrated: number }>;

/** Recovery per game hour while the gate is open, and the gate's limits, all from body content. */
interface Recovery {
  readonly perGameHour: number;
  readonly needsFloor: NeedsFloor;
  readonly fatigueCeiling: number;
}

/** The body as the recovery gate reads it. */
type RecoveryBody = Pick<
  HealthPool,
  'healthRecoveryPerGameHour' | 'healthRecoveryNeedsFloor' | 'healthRecoveryFatigueCeiling'
>;

/** Reads the gate's rate and limits from the body once, for a state. */
const recoveryOf = (body: RecoveryBody, state: RecoveryState, recoveryFactor = 1): Recovery => ({
  perGameHour: body.healthRecoveryPerGameHour * recoveryFactor,
  needsFloor: body.healthRecoveryNeedsFloor,
  fatigueCeiling: body.healthRecoveryFatigueCeiling(state),
});

/** The one gate deciding whether health and regions recover now. */
const healthRecovers = (needs: Needs, { needsFloor, fatigueCeiling }: Recovery): boolean =>
  needs.calories >= needsFloor.calories && needs.hydration >= needsFloor.hydration && needs.fatigue <= fatigueCeiling;

/** The recovery rate per game hour: `recovery.perGameHour` while the gate is open, else none. */
const healthRegenRate = (needs: Needs, recovery: Recovery): number =>
  healthRecovers(needs, recovery) ? recovery.perGameHour : 0;

/** Whether the needs let the body recover in this state: health and region damage come back, and wounds close by themselves. */
export const needsAllowRecovery = (needs: Needs, body: RecoveryBody, state: RecoveryState): boolean =>
  healthRegenRate(needs, recoveryOf(body, state)) > 0;

/** Health's rate per game hour for the needs and health as they are now. */
const healthRate = (needs: Needs, health: number, recovery: Recovery, loss: HealthLoss): number => {
  let rate = 0;
  if (needs.calories <= 0) {
    rate -= loss.starving;
  }
  if (needs.hydration <= 0) {
    rate -= loss.dehydrated;
  }
  if (rate < 0) {
    return rate;
  }
  return health < 100 ? healthRegenRate(needs, recovery) : 0;
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

type Level = readonly [Need, number];

/** The levels where a rate changes: a need emptying, or a limit of the recovery gate. */
const levelsFor = ({ needsFloor, fatigueCeiling }: Recovery): readonly Level[] => [
  ['calories', 0],
  ['calories', needsFloor.calories],
  ['hydration', 0],
  ['hydration', needsFloor.hydration],
  ['fatigue', fatigueCeiling],
];

/** Hours until a need reaches the next level. */
const nextLevel = (needs: Needs, rates: Readonly<Record<Need, number>>, levels: readonly Level[]): number =>
  Math.min(...levels.map(([need, level]) => hoursTo(needs[need], rates[need], level)));

/** Puts a value that has just reached a level exactly on it, so rounding can't carry it past unnoticed. */
const snap = (needs: Needs, levels: readonly Level[]): void => {
  for (const [need, level] of levels) {
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
  { recovery, loss }: { recovery: Recovery; loss: HealthLoss },
): { health: number; regionRecovery: number } => {
  const ahead = { ...needs };
  for (const need of NEEDS) {
    ahead[need] = bound(need, needs[need] + rates[need] * 1e-6);
  }
  return { health: healthRate(ahead, health, recovery, loss), regionRecovery: healthRegenRate(ahead, recovery) };
};

/** The body as the needs step uses it. */
export interface HealthPool {
  readonly health: number;
  readonly fatigueRisePerGameHour: number;
  /** Calories and hydration lost per game hour. */
  readonly needDrainPerGameHour: Readonly<{ calories: number; hydration: number }>;
  readonly healthLossPerGameHour: HealthLoss;
  readonly criticalNeeds: readonly CriticalRule[];
  readonly badlyHurt: Readonly<{ below: number; message: string }>;
  readonly healthRecoveryPerGameHour: number;
  readonly healthRecoveryNeedsFloor: NeedsFloor;
  healthRecoveryFatigueCeiling: (state: RecoveryState) => number;
  damageHealth: (amount: number) => number;
  restoreHealth: (amount: number) => void;
  recoverRegionDamage: (ratePerGameHour: number, gameHours: number, elapsedGameHours: number) => void;
}

export interface StepNeedsOptions {
  damageImmune?: boolean;
  /** Per game hour; resting and sleeping override fatigue's. Defaults to awake. */
  rates?: Readonly<Record<Need, number>>;
  /** Multiplies health and regional recovery: sleep's factor, or 1 awake. */
  recoveryFactor?: number;
  /** Picks the body's fatigue ceiling for recovery. Defaults to awake. */
  state?: RecoveryState;
}

/** The rates while awake: fatigue accrues at the body's rate. */
export const awakeRates = (
  body: Pick<HealthPool, 'fatigueRisePerGameHour' | 'needDrainPerGameHour'>,
): Readonly<Record<Need, number>> => ({
  calories: -body.needDrainPerGameHour.calories,
  hydration: -body.needDrainPerGameHour.hydration,
  fatigue: body.fatigueRisePerGameHour,
});

/**
 * Advances needs, health and eligible regional recovery by `hours` game hours, in
 * place, exactly: the step is split wherever a rate changes. Returns the messages for needs that became critical
 * during the step. `damageImmune` suppresses health loss while preserving need decay
 * and recovery. Stamina isn't touched; it moves by the second (`stepStamina`).
 */
export const stepNeeds = (
  needs: Needs,
  body: HealthPool,
  hours: number,
  { damageImmune = false, rates = awakeRates(body), recoveryFactor = 1, state = 'awake' }: StepNeedsOptions = {},
): string[] => {
  const before = { ...needs };
  const beforeHealth = body.health;
  const recovery = recoveryOf(body, state, recoveryFactor);
  const levels = levelsFor(recovery);
  let left = hours;
  let elapsedGameHours = 0;
  while (left > 0 && body.health > 0) {
    const segment = segmentRates(needs, body.health, rates, { recovery, loss: body.healthLossPerGameHour });
    const healthRatePerHour = damageImmune ? Math.max(0, segment.health) : segment.health;
    const h = Math.min(
      left,
      nextLevel(needs, rates, levels),
      hoursTo(body.health, healthRatePerHour, 0),
      hoursTo(body.health, healthRatePerHour, 100),
    );
    for (const need of NEEDS) {
      needs[need] = bound(need, needs[need] + rates[need] * h);
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
    snap(needs, levels);
    elapsedGameHours += h;
    left -= h;
  }
  const messages = body.criticalNeeds
    .filter((rule) => !isCritical(before, rule) && isCritical(needs, rule))
    .map((rule) => rule.message);
  const { below, message } = body.badlyHurt;
  if (beforeHealth >= below && body.health < below) {
    messages.push(message);
  }
  return messages;
};

/** Stamina recovers slower while any need is critical. */
const worn = (needs: Needs, critical: readonly CriticalRule[]): boolean =>
  critical.some((rule) => isCritical(needs, rule));

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
  { staminaRegenDelaySimSeconds = 0, ...rules }: StaminaRules & { staminaRegenDelaySimSeconds?: number },
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
    spendStamina(needs, rules.sprintPerSimSecond * seconds, staminaRegenDelaySimSeconds);
    return;
  }
  let recoverySeconds = seconds;
  if (needs.stamina === 0 && needs.staminaRegenDelayRemainingSimSeconds > 0) {
    const waiting = Math.min(recoverySeconds, needs.staminaRegenDelayRemainingSimSeconds);
    needs.staminaRegenDelayRemainingSimSeconds -= waiting;
    recoverySeconds -= waiting;
  }
  if (recoverySeconds > 0) {
    const factor = worn(needs, rules.critical) ? rules.wornRecoveryFactor : 1;
    needs.stamina = clamp(needs.stamina + rules.recoverPerSimSecond * factor * recoverySeconds);
  }
};

/** Whether you can sprint: not while winded, and once winded, not until you've got some breath back. */
export const canSprint = (needs: Needs, sprinting: boolean, rules: Pick<StaminaRules, 'windedBelow'>): boolean =>
  sprinting ? needs.stamina > 0 : needs.stamina >= rules.windedBelow;

/** What eating or drinking something gives, in percent. */
const nourishment = (
  food: { calories: number; water: number },
  full: NourishmentScale,
): { calories: number; hydration: number } => ({
  calories: (food.calories / full.kcal) * 100,
  hydration: (food.water / full.ml) * 100,
});

/** Eats or drinks something that isn't rotten, in place. */
export const consume = (needs: Needs, food: { calories: number; water: number }, full: NourishmentScale): void => {
  const gain = nourishment(food, full);
  needs.calories = clamp(needs.calories + gain.calories);
  needs.hydration = clamp(needs.hydration + gain.hydration);
};
