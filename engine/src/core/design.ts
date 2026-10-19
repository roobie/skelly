import type { Assembly, Domain } from './schema.ts';
import type { Template } from './template.ts';

/** Version of the persisted design-file contract, independent of the assembly schema. */
type DesignFormat = 1;

/** Parameter values and optional-slot choices that a designer deliberately fixed. */
export interface DesignLocks {
  /** Part id -> parameter names. Values remain in `assembly`; locks are metadata only. */
  readonly params: Readonly<Record<string, readonly string[]>>;
  /** Template slot ids whose present/absent choice is locked. */
  readonly optionalParts: readonly string[];
}

/** The existing viewer override grammar, kept here without a viewer dependency. */
export interface DesignOverrides {
  readonly params: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Template slot id -> selected presence. */
  readonly presence: Readonly<Record<string, boolean>>;
}

export interface DesignOrigin {
  readonly template: string;
  readonly seed: number;
  readonly overrides: DesignOverrides;
}

/** A curated, template-backed file. Only chosen values are stored; inherited and default params stay implicit. */
export interface Design {
  readonly format: DesignFormat;
  readonly template: string;
  readonly assembly: Assembly;
  readonly locks: DesignLocks;
  readonly status: DesignStatus;
  /** Optional slot-to-material finish overrides; absent keeps template defaults. */
  readonly finish?: Readonly<Record<string, string>>;
  readonly origin?: DesignOrigin;
}

export type DesignStatus = 'draft' | 'published';

type DesignIssueCode = 'infeasible' | 'template-choice' | 'prefab-values-mismatch';

/** A non-fatal loading/publishing problem; a design with issues is loaded only as a draft. */
export interface DesignIssue {
  readonly code: DesignIssueCode;
  readonly message: string;
  readonly path?: string;
  readonly parts?: readonly string[];
}

type DesignLoadErrorCode = 'invalid-json' | 'invalid-shape' | 'unsupported-format' | 'unknown-prefab';

/** A fatal parse/load failure. Unknown prefab ids or versions are refused, not downgraded. */
export interface DesignLoadError {
  readonly code: DesignLoadErrorCode;
  readonly message: string;
  readonly path?: string;
}

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type DesignLoadResult =
  | {
      readonly ok: true;
      readonly declaredStatus: DesignStatus;
      readonly design: Design;
      readonly issues: readonly [];
    }
  | {
      readonly ok: true;
      readonly declaredStatus: DesignStatus;
      readonly design: Design & { readonly status: 'draft' };
      readonly issues: NonEmptyReadonlyArray<DesignIssue>;
    }
  | {
      readonly ok: false;
      /** Undefined only when malformed input did not yield a readable status field. */
      readonly declaredStatus: DesignStatus | undefined;
      readonly error: DesignLoadError;
    };

export interface SuggestionResult {
  /** Draft candidates; preserve origin, locks for surviving parts, and prefab references. */
  readonly variants: readonly (Design & { readonly status: 'draft' })[];
  /** True when the attempt budget runs out before `n` variants are found. */
  readonly exhausted: boolean;
}

/** Precomputed by the caller from design locks and only the fixed params of each referenced prefab. */
export type EffectiveSuggestionLocks = DesignLocks;

/** Signature only; the suggester is introduced in 3.3. */
// biome-ignore lint/complexity/useMaxParams: the frozen 3.3 API plus effective prefab locks is explicit by contract.
export type Suggest = (
  design: Design,
  template: Template,
  domain: Domain,
  effectiveLocks: EffectiveSuggestionLocks,
  seed: number,
  n: number,
  budget: number,
) => SuggestionResult;
/** Kept on PartInstance so a saved design preserves the selected catalogue version. */
