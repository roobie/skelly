import type { DamageKind } from './body.ts';

/** One strike against the world: a terrain cell or a piece takes it alike. */
export interface Blow {
  strength: number;
  kind: DamageKind;
}

/**
 * The strength of `blow` that gets past a material's per-kind `resistance`. Resistance is a fraction removed before
 * the target's strength gate, not a second durability pool, and terrain and pieces read it the same way so a kind
 * means one thing everywhere.
 */
export const strengthPast = (blow: Blow, resistance: Readonly<Record<string, number>>): number => {
  if (!Object.hasOwn(resistance, blow.kind)) {
    throw new Error(`Unsupported damage kind "${blow.kind}"`);
  }
  return blow.strength * (1 - resistance[blow.kind]!);
};
