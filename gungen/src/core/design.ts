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

/** A curated, template-backed file. All selected assembly values are stored explicitly. */
export interface Design {
  readonly format: DesignFormat;
  readonly template: string;
  readonly assembly: Assembly;
  readonly locks: DesignLocks;
  readonly status: 'draft' | 'published';
  readonly origin?: DesignOrigin;
}

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
  | { readonly ok: true; readonly design: Design; readonly issues: readonly [] }
  | {
      readonly ok: true;
      readonly design: Design & { readonly status: 'draft' };
      readonly issues: NonEmptyReadonlyArray<DesignIssue>;
    }
  | { readonly ok: false; readonly error: DesignLoadError };

/** Generic right-handed frame. Anchor directions are unit vectors in the owning coordinate space. */
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

/** Part id -> named frames transformed into resolved assembly coordinates. */
export type ResolvedAnchors<Name extends string = string> = Readonly<Record<string, NamedAnchors<Name>>>;

/** Contract for the generic core transformation from family-local to assembly-space anchors. */
export type ResolveAnchors = <Name extends string>(
  resolved: Resolved,
  declarations: PartAnchorDeclarations<Name>,
) => ResolvedAnchors<Name>;

/** An sRGB colour as normalized red, green, blue channels in [0, 1]. */
export type SrgbColor = readonly [red: number, green: number, blue: number];

/** Family colours plus domain-named special colours (for example, `floorplate`). */
export interface Palette {
  readonly familyColors: Readonly<Record<string, SrgbColor>>;
  readonly specialColors: Readonly<Record<string, SrgbColor>>;
}

/** Stable id for a placed port in exported node metadata. */
export type PartPortId = `${string}.${string}`;

/** World-space mating frame for a port; its local X/normal points out of the part. */
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

/** Structural mirror of deadvox's model content entry, without importing deadvox into core. */
export interface DeadvoxModelEntry {
  readonly id: string;
  readonly file: string;
  readonly grip: {
    readonly at: Vec3;
    /** Euler angles in degrees, in deadvox's x/y/z order. */
    readonly turn: Vec3;
  };
  /** World positions of named anchors such as `support` and `muzzle`. */
  readonly anchors?: Readonly<Record<string, Vec3>>;
}

export interface GlbAssetIdentity {
  readonly id: string;
  readonly file: string;
}

/** All domain-specific inputs are supplied explicitly; this type imports no gun module. */
export interface GlbExportInput {
  readonly resolved: Resolved;
  readonly anchors: ResolvedAnchors;
  readonly palette: Palette;
  readonly asset: GlbAssetIdentity;
}

export interface GlbExportResult {
  readonly glb: Uint8Array;
  readonly modelEntry: DeadvoxModelEntry;
}

/** Signature only; the writer is introduced in 3.4. */
export type ExportGlb = (input: GlbExportInput) => GlbExportResult;

export interface SuggestionResult {
  readonly variants: readonly Design[];
  /** True when the attempt budget runs out before `n` variants are found. */
  readonly exhausted: boolean;
}

/** Signature only; the suggester is introduced in 3.3. */
// biome-ignore lint/complexity/useMaxParams: the frozen 3.3 API explicitly specifies these six arguments.
export type Suggest = (
  design: Design,
  template: Template,
  domain: Domain,
  seed: number,
  n: number,
  budget: number,
) => SuggestionResult;

/** Kept on PartInstance so a saved design preserves the selected catalogue version. */
export type { PrefabReference } from './schema.ts';
