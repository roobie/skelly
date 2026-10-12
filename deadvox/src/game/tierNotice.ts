/**
 * Speaks a tier's notice (INTERFACE.md, class 3) once each time a tiered body state, such as the worst bleeding
 * or felt pain, worsens to a tier that has one; content leaves the notice off a tier that passes without mention
 * (DESIGN.md, "Bleeding" and "Pain").
 */
export class TierNotice {
  private tier: number | undefined;

  constructor(initialTier: number | undefined) {
    this.tier = initialTier;
  }

  update(
    tier: number | undefined,
    tiers: readonly { readonly notice?: string | undefined }[],
    notify: (notice: string) => void,
  ): void {
    const notice = tier === undefined ? undefined : tiers[tier]?.notice;
    if (notice !== undefined && tier! > (this.tier ?? -1)) {
      notify(notice);
    }
    this.tier = tier;
  }
}
