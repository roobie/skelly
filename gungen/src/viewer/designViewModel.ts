import type { DesignLoadResult } from '../core/design.ts';
import { GUN_PREFABS, type PrefabCatalogue } from '../gun/prefabs.ts';

export interface DesignPrefabView {
  readonly label: string;
  readonly fixedParams: Readonly<Record<string, string>>;
  /** Uses the design loader's prefab-values-mismatch issues, not a second value comparison. */
  readonly stale: boolean;
}

export type DesignViewModel =
  | {
      readonly kind: 'fatal';
      readonly name: string;
      readonly declaredStatus: string | undefined;
      readonly errorCode: string;
      readonly errorMessage: string;
    }
  | {
      readonly kind: 'loaded';
      readonly name: string;
      readonly template: string;
      readonly declaredStatus: string;
      readonly loadedStatus: string;
      readonly issues: readonly { readonly code: string; readonly message: string }[];
      readonly locks: {
        readonly params: Readonly<Record<string, readonly string[]>>;
        readonly optionalParts: readonly string[];
      };
      readonly prefabsByPart: Readonly<Record<string, DesignPrefabView>>;
    };

/** Pure read model for design status, load issues, locks, and prefab annotations. */
export const buildDesignViewModel = (
  result: DesignLoadResult,
  sourceName: string,
  prefabs: PrefabCatalogue = GUN_PREFABS,
): DesignViewModel => {
  if (!result.ok) {
    return {
      kind: 'fatal',
      name: sourceName,
      declaredStatus: result.declaredStatus,
      errorCode: result.error.code,
      errorMessage: result.error.message,
    };
  }

  const prefabsByPart: Record<string, DesignPrefabView> = {};
  for (const [partId, part] of Object.entries(result.design.assembly.parts)) {
    const reference = part.prefab;
    if (!reference) {
      continue;
    }
    const prefab = prefabs.find((entry) => entry.id === reference.id && entry.version === reference.version);
    if (!prefab) {
      // Unknown references are fatal in loadGunDesign and cannot label a loaded view.
      continue;
    }
    prefabsByPart[partId] = {
      label: `${prefab.id} v${prefab.version}`,
      fixedParams: prefab.fixedParams,
      stale: result.issues.some((issue) => issue.code === 'prefab-values-mismatch' && issue.parts?.includes(partId)),
    };
  }

  return {
    kind: 'loaded',
    name: result.design.assembly.name,
    template: result.design.template,
    declaredStatus: result.declaredStatus,
    loadedStatus: result.design.status,
    issues: result.issues.map(({ code, message }) => ({ code, message })),
    locks: result.design.locks,
    prefabsByPart,
  };
};
