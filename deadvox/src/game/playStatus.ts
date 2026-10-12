import { BODY_REGIONS, type BodyRegion, bodyRegionLabel } from '../core/body.ts';

export interface BleedingStatusRow {
  readonly region: string;
  readonly label: string;
  readonly warn: boolean;
}

interface BleedingTierStatus {
  readonly label: string;
  readonly warn: boolean;
}

export const bleedingStatusRows = (
  bleedingTier: (region: BodyRegion) => BleedingTierStatus | undefined,
): BleedingStatusRow[] =>
  BODY_REGIONS.flatMap((region) => {
    const tier = bleedingTier(region);
    return tier ? [{ region: bodyRegionLabel(region), label: tier.label, warn: tier.warn }] : [];
  });
