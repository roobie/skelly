// One precision table for every number a player can read, so raw floats never reach UI text
// (`INTERFACE.md`, "Text") and each kind's precision lives here rather than scattered at call
// sites (`PILLARS.md`, "Content forward compatibility"). Text slots accept only strings
// (`src/core/textTemplate.ts`, `fillText`, and `src/ui/keyCap.ts`, `fillHint`), so a number must
// name its kind here.

/** Whole counts: rounds, levels, indexes, calories, cells. */
export const countText = (value: number): string => String(Math.round(value));

/** One fixed decimal for values that tick while the player watches: times, distances, speeds, practice. */
export const decimalText = (value: number): string => value.toFixed(1);

/** Two fixed decimals for small ratios read at a glance: volumes, carried weight. */
export const hundredthsText = (value: number): string => value.toFixed(2);

/** Authored stat values, whole or fractional: one decimal at most, trailing zeros dropped. */
export const statText = (value: number): string => String(Math.round(value * 10) / 10);

/** A share already scaled to percent, with its sign. */
export const percentText = (value: number): string => `${Math.round(value)}%`;
