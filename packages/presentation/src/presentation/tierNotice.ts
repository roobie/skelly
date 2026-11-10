/**
 * Speaks a tier's notice (`packages/deadvox/INTERFACE.md`, "Class 3: the character's voice") whenever a tiered body state
 * worsens to a tier that has a notice; content leaves the notice off a tier that passes without mention
 * (`packages/deadvox/DESIGN.md`, "Bleeding"; `packages/deadvox/DESIGN.md`, "Pain").
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
