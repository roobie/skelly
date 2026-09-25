// The player's needs, in percent, changing at rates per game hour. Milestone 1.2 has
// only the rates, which the compression tests need; eating, drinking, sleep, stamina
// and their effects come in 1.6 and 1.8, where the rates are tuned.

export interface Needs {
  /** 100 is full. */
  calories: number;
  /** 100 is fully hydrated. */
  hydration: number;
  /** 0 is rested, 100 is exhausted. */
  fatigue: number;
}

export type Need = keyof Needs;

/** Change per game hour while awake. */
export const NEED_RATES: Readonly<Needs> = { calories: -3, hydration: -5, fatigue: 4 };

/** Slice 1 spawns hungry, thirsty and tired (SLICE-1.md, "Tunables"). */
export const SPAWN_NEEDS: Readonly<Needs> = { calories: 40, hydration: 35, fatigue: 70 };

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

/**
 * Advances needs by `hours` game hours, in place. Returns the messages for needs
 * that became critical during the step.
 */
export const stepNeeds = (needs: Needs, hours: number): string[] => {
  const before = { ...needs };
  for (const need of Object.keys(NEED_RATES) as Need[]) {
    needs[need] = clamp(needs[need] + NEED_RATES[need] * hours);
  }
  return CRITICAL.filter((rule) => !isCritical(before, rule) && isCritical(needs, rule)).map((rule) => rule.message);
};
