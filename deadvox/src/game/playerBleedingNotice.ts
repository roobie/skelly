import { BLEEDING_TIERS, type BleedingTier } from '../core/body.ts';

/** The tiers the notice speaks for; a scratch passes without mention (DESIGN.md, "Bleeding"). */
type NoticedTier = Exclude<BleedingTier, 'scratch'>;

/** The character's voice for each noticed tier (INTERFACE.md, class 3). */
export const BLEEDING_NOTICE: Readonly<Record<NoticedTier, string>> = {
  moderate: "You're bleeding moderately.",
  heavy: "You're bleeding heavily.",
  arterial: "You're bleeding from an artery.",
};

const rank = (tier: BleedingTier | null): number => (tier === null ? -1 : BLEEDING_TIERS.indexOf(tier));

/** Emits once each time the player's worst bleeding worsens to moderate or beyond. */
export class PlayerBleedingNotice {
  private worst: BleedingTier | null;

  constructor(initialWorst: BleedingTier | null) {
    this.worst = initialWorst;
  }

  update(worst: BleedingTier | null, notify: (tier: NoticedTier) => void): void {
    if (worst !== null && worst !== 'scratch' && rank(worst) > rank(this.worst)) {
      notify(worst);
    }
    this.worst = worst;
  }
}
