import type { SkilledActor } from '@skelly/engine/internal/core/modifiers.ts';

/** An actor with every skill role at one level, for cases that vary skill without naming its provider. */
export const skilledAt = (level: number): SkilledActor => ({ skillLevel: () => level });

/** An actor skilled only in one role, for cases that check which role feeds an effect. */
export const skilledIn = (role: string, level: number): SkilledActor => ({
  skillLevel: (asked) => (asked === role ? level : 0),
});
