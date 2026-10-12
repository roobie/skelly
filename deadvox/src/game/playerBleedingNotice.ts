import type { BodyTuningDef } from '../core/schema.ts';

type BleedingTierDef = BodyTuningDef['bleeding']['tiers'][number];

/**
 * Speaks a tier's notice (INTERFACE.md, class 3) once each time the player's worst bleeding worsens to a tier
 * that has one; content leaves the notice off a tier that passes without mention (`DESIGN.md`, "Bleeding").
 */
export class PlayerBleedingNotice {
  private worst: number | undefined;

  constructor(initialWorst: number | undefined) {
    this.worst = initialWorst;
  }

  update(worst: number | undefined, tiers: readonly BleedingTierDef[], notify: (notice: string) => void): void {
    const notice = worst === undefined ? undefined : tiers[worst]?.notice;
    if (notice !== undefined && worst! > (this.worst ?? -1)) {
      notify(notice);
    }
    this.worst = worst;
  }
}
