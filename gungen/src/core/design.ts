import type { Issue } from './issue.ts';
import type { Vec3 } from './math.ts';
import type { Resolved } from './resolve.ts';
import type { Assembly, Domain, Gender, PartDef } from './schema.ts';
import type { Template } from './template.ts';

/** Version of the persisted design-file contract, independent of the assembly schema. */
export type DesignFormat = 1;

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

export type DesignIssueCode = 'infeasible' | 'template-choice' | 'prefab-values-mismatch';

/** A non-fatal loading/publishing problem; a design with issues is loaded only as a draft. */
export interface DesignIssue {
  readonly code: DesignIssueCode;
  readonly message: string;
  readonly path?: string;
  readonly parts?: readonly string[];
}

export type DesignLoadErrorCode = 'invalid-json' | 'invalid-shape' | 'unsupported-format' | 'unknown-prefab';

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

/** Generic right-handed frame in its owner's local or resolved assembly space; units are gungen `u`. */
export interface AnchorFrame {
  readonly position: Vec3;
  readonly forward: Vec3;
  readonly up: Vec3;
}

/** Named local anchors declared by a part family; names are supplied by its domain. */
export type NamedAnchors<Name extends string = string> = Readonly<Partial<Record<Name, AnchorFrame>>>;

/** One family-local declaration, evaluated against its selected params and built part definition. */
export type PartAnchorDeclaration<Name extends string = string> = (
  params: Readonly<Record<string, string>>,
  part: PartDef,
) => NamedAnchors<Name>;

/** Family name -> local anchor declaration. This registry is supplied by a domain, not stored in core. */
export type PartAnchorDeclarations<Name extends string = string> = Readonly<
  Record<string, PartAnchorDeclaration<Name>>
>;

/** Part id -> named frames transformed into resolved assembly coordinates (gungen units). */
export type ResolvedAnchors<Name extends string = string> = Readonly<Record<string, NamedAnchors<Name>>>;

/** Generic selection passed to exporters after domain-specific precedence has been applied. */
export interface SelectedAnchors {
  /** Required winning hold frame, in gungen assembly coordinates and units. */
  readonly hold: AnchorFrame;
  /** Other selected named frames, in the same space; this map excludes `hold`. */
  readonly others: Readonly<Record<string, AnchorFrame>>;
}

export type AnchorSelectionError =
  | { readonly code: 'missing-required-anchor'; readonly name: string }
  | { readonly code: 'ambiguous-anchor'; readonly name: string; readonly candidates: readonly string[] };

/** Contract for the generic core transformation from family-local to assembly-space anchors. */
export type ResolveAnchors = <Name extends string>(
  resolved: Resolved,
  declarations: PartAnchorDeclarations<Name>,
) => ResolvedAnchors<Name>;

/**
 * An sRGB colour as normalized red, green, blue channels in [0, 1]. TypeScript cannot enforce finiteness or range;
 * palette construction and the exporter validate all three channels.
 */
export type SrgbColor = readonly [red: number, green: number, blue: number];

/**
 * Palette keeps legacy role colours for geometry inspection and optionally supplies material/slot finishing.
 * A role selects its default slot and shade; colour follows the resolved material.
 */
export interface AppearanceContext {
  readonly variant?: string;
  readonly finish?: Readonly<Record<string, string>>;
}

export interface Palette {
  readonly familyColors: Readonly<Record<string, SrgbColor>>;
  readonly specialColors: Readonly<Record<string, SrgbColor>>;
  readonly fallbackColor: SrgbColor;
  readonly materials?: Readonly<Record<string, SrgbColor>>;
  readonly roleSlots?: Readonly<Record<string, string>>;
  /** Role-default material ids, used when no special, part, design, or archetype finish applies. */
  readonly roleMaterials?: Readonly<Record<string, string>>;
  /** Multipliers, one RGB triple per role, applied to the material's sRGB base colour. */
  readonly roleShades?: Readonly<Record<string, SrgbColor>>;
  readonly archetypeFinishes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * Stable placed-port id. This template type cannot rule out empty components or embedded dots; the exporter validates
 * both parts and ports as non-empty ids containing no dots before emitting metadata.
 */
export type PartPortId = `${string}.${string}`;

/** Mating frame in gungen assembly coordinates and units; its local X/normal points out of the part. */
export interface PortMatingFrame {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly up: Vec3;
}

export interface RailPortMetadata {
  readonly count: number;
  readonly pitch: number;
}

/** Port data stored in each exported part node's glTF extras. */
export interface ExportPortMetadata {
  readonly id: PartPortId;
  readonly mount: string;
  readonly gender: Gender;
  readonly size?: string;
  readonly frame: PortMatingFrame;
  /** Present for rails; one exported node represents the whole rail. */
  readonly rail?: RailPortMetadata;
}

/** Deadvox path shape; the exporter also validates the name against `[a-z0-9_-]+`. */
export type DeadvoxModelFile = `assets/models/${string}.glb`;

/** Structural mirror of deadvox's model entry, without importing deadvox into core; intentionally omits `hold` and `roll`. */
export interface DeadvoxModelEntry {
  readonly id: string;
  readonly file: DeadvoxModelFile;
  readonly grip: {
    /** Position in exported-model metres, after conversion to deadvox axes (+X forward, +Y up). */
    readonly at: Vec3;
    /** Euler angles in degrees, in deadvox's x/y/z order; always emitted for gungen firearms. */
    readonly turn: Vec3;
  };
  /** Named anchor positions in exported-model metres, after axis conversion to deadvox axes (+X forward, +Y up). */
  readonly anchors?: Readonly<Record<string, Vec3>>;
}

export interface GlbAssetIdentity {
  readonly id: string;
  /** The file name component is checked against deadvox's `[a-z0-9_-]+` path rule at export time. */
  readonly file: DeadvoxModelFile;
}

/** All domain-specific inputs are supplied explicitly; this type imports no gun module. */
export interface GlbExportInput {
  readonly resolved: Resolved;
  /** Domain-selected assembly-space frames; core does not apply gun precedence. */
  readonly anchors: SelectedAnchors;
  readonly palette: Palette;
  /** Optional domain-agnostic appearance context, supplied by the caller (never inferred from assembly.name). */
  readonly appearance?: AppearanceContext;
  /** Optional design-level slot-to-material overrides, ahead of variant defaults. */
  readonly finish?: Readonly<Record<string, string>>;
  readonly asset: GlbAssetIdentity;
}

export type GlbExportError =
  | { readonly code: 'structure-issues'; readonly issues: readonly Issue[] }
  | { readonly code: 'unplaced-parts'; readonly partIds: readonly string[] }
  | { readonly code: 'invalid-port-id'; readonly id: string }
  | { readonly code: 'invalid-palette-color'; readonly key: string }
  | { readonly code: 'invalid-asset-file'; readonly file: string };

export type GlbExportResult =
  | { readonly ok: true; readonly glb: Uint8Array; readonly modelEntry: DeadvoxModelEntry }
  | { readonly ok: false; readonly error: GlbExportError };

/** Signature only; the writer refuses unresolved/partly placed assemblies and invalid export metadata. */
export type ExportGlb = (input: GlbExportInput) => GlbExportResult;

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
export type { PrefabReference } from './schema.ts';
