import type { PrefabReference } from '../core/schema.ts';

/** A curated, versioned family instance. Game properties are deliberately deferred to gungen.2. */
export interface PrefabCatalogueEntry extends PrefabReference {
  readonly family: string;
  readonly fixedParams: Readonly<Record<string, string>>;
}

/** Multiple immutable revisions of one id may coexist for persisted designs. */
export type PrefabCatalogue = readonly PrefabCatalogueEntry[];
