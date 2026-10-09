import type { PrefabReference } from '@skelly/engine/core/schema.ts';

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

/** Curated, versioned part variants available to designs. */
export const GUN_PREFABS: PrefabCatalogue = [
  // The 20-round body is straight with a slanted floorplate; the 30-round body remains curved.
  { id: 'stanag-20', version: 1, family: 'magazine', fixedParams: { length: 'M', profile: 'stanag-straight' } },
  { id: 'stanag-30', version: 1, family: 'magazine', fixedParams: { length: 'L', profile: 'stanag-curved' } },
  // The variant selects the AK curve geometry; its L band is in `MAGAZINE_PROFILE_LENGTHS_U` (parts.ts).
  {
    id: 'ak74-30',
    version: 1,
    family: 'magazine',
    fixedParams: { length: 'L', profile: 'ak-curved', variant: 'ak74' },
  },
  { id: 'akm-30', version: 1, family: 'magazine', fixedParams: { length: 'L', profile: 'ak-curved', variant: 'akm' } },
];
