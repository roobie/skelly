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
