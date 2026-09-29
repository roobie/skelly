import type { PrefabReference } from '../core/schema.ts';

/** A curated, versioned family instance. Game properties are deliberately deferred to gungen.2. */
export interface PrefabCatalogueEntry extends PrefabReference {
  /**
   * The registry key of the part family (the key in `FAMILIES`, e.g.
   * 'ak-receiver'), matched against `PartInstance.family`. It is not
   * `PartDef.family`. The registry key names the builder recipe, and a prefab
   * fixes that recipe's params.
   */
  readonly family: string;
  readonly fixedParams: Readonly<Record<string, string>>;
}

/** Multiple immutable revisions of one id may coexist for persisted designs. */
export type PrefabCatalogue = readonly PrefabCatalogueEntry[];

/** Curated magazine variants available to designs. Values follow `magazineLengthData` and the curved-profile table in `parts.ts`. */
export const GUN_PREFABS: PrefabCatalogue = [
  // STANAG M = 10u (20-round reference); L = 15.75u (30-round curve).
  { id: 'stanag-20', version: 1, family: 'magazine', fixedParams: { length: 'M', profile: 'stanag-curved' } },
  { id: 'stanag-30', version: 1, family: 'magazine', fixedParams: { length: 'L', profile: 'stanag-curved' } },
  // AK-74 and AKM L bands are 16.5u and 19.25u respectively; variant selects curve geometry.
  {
    id: 'ak74-30',
    version: 1,
    family: 'magazine',
    fixedParams: { length: 'L', profile: 'ak-curved', variant: 'ak74' },
  },
  { id: 'akm-30', version: 1, family: 'magazine', fixedParams: { length: 'L', profile: 'ak-curved', variant: 'akm' } },
];
