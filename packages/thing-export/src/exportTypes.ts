// Inputs and results of the GLB exporter, and the palette it colours with. They sit above the assembly
// layer because the exporter needs a resolved assembly; the assembly types never import them.

import type { Gender, Resolved } from '@skelly/engine/assembly/schema.ts';
import type { Issue } from '@skelly/engine/foundation/issue.ts';
import type { Vec3 } from '@skelly/engine/foundation/math.ts';

/**
 * An sRGB colour as normalized red, green, blue channels in [0, 1]. TypeScript cannot enforce finiteness or range;
 * palette construction and the exporter validate all three channels.
 */
export type SrgbColor = readonly [red: number, green: number, blue: number];

/**
 * Roles support geometry inspection independently of a material finish.
 * A role selects its default slot and shade; finished colour follows the resolved material.
 */
export interface AppearanceContext {
  readonly appearanceProfile?: string;
  readonly finish?: Readonly<Record<string, string>>;
}

export interface MaterialAppearance {
  readonly colour: SrgbColor;
  readonly finish: { readonly metallic: number; readonly roughness: number; readonly opacity?: number | undefined };
}

export interface Palette {
  readonly familyColors: Readonly<Record<string, SrgbColor>>;
  readonly specialColors: Readonly<Record<string, SrgbColor>>;
  readonly fallbackColor: SrgbColor;
  readonly materials?: Readonly<Record<string, MaterialAppearance>>;
  readonly fallbackFinish: MaterialAppearance['finish'];
  readonly roleSlots?: Readonly<Record<string, string>>;
  /** Role-default material ids, used when no special, part, design, or profile finish applies. */
  readonly roleMaterials?: Readonly<Record<string, string>>;
  /** Multipliers, one RGB triple per role, applied to the material's sRGB base colour. */
  readonly roleShades?: Readonly<Record<string, SrgbColor>>;
  readonly profileFinishes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * Stable placed-port id. This template type cannot rule out empty components or embedded dots; the exporter validates
 * both parts and ports as non-empty ids containing no dots before emitting metadata.
 */
export type PartPortId = `${string}.${string}`;

/** Mating frame in assembly coordinates and domain units; local X/normal points out of the part. */
interface PortMatingFrame {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly up: Vec3;
}

interface RepeatedPortMetadata {
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
  /** One port node can describe a repeated run of mating positions. */
  readonly slots?: RepeatedPortMetadata;
}

export interface GlbAssetIdentity {
  readonly id: string;
  readonly file: string;
}

/** All domain-specific inputs are supplied explicitly; this type imports no domain module. */
export interface GlbExportInput {
  readonly resolved: Resolved;
  readonly palette: Palette;
  /** Optional domain-agnostic appearance context, supplied by the caller (never inferred from assembly.name). */
  readonly appearance?: AppearanceContext;
  /** Optional design-level slot-to-material overrides, ahead of appearance-profile defaults. */
  readonly finish?: Readonly<Record<string, string>>;
  readonly asset: GlbAssetIdentity;
  /** Optional exporter identity placed in the glTF asset record. */
  readonly generator?: string;
  /** Namespace for the engine's root assembly metadata in glTF extras. */
  readonly metadataNamespace?: string;
  /** Facets of every revolved solid in the file: a level of detail baked in at export. Defaults to the mesh default. */
  readonly revolveFacets?: number;
  /**
   * Voxel edge in metres. When set, each part's drawn solids are sampled at this grain and written as a greedy-meshed
   * voxel mesh, one primitive per finish, instead of their smooth meshes. Every model export sets it (see `recipe.ts`,
   * `recipeVoxel`); absent, the file holds the authored smooth meshes, which only geometry checks read.
   */
  readonly voxelGrain?: number;
  /**
   * Voxel edge in metres for the parts whose definition carries the `VOXEL_DETAIL` tag (see `glb.ts`); every other part
   * keeps `voxelGrain`. Must divide `voxelGrain` a whole number of times so the two lattices nest. Needs `voxelGrain`.
   */
  readonly voxelDetailGrain?: number;
}

/** A model export's voxel class as the GLB writer takes it. */
export type VoxelGrains = Required<Pick<GlbExportInput, 'voxelGrain'>> & Pick<GlbExportInput, 'voxelDetailGrain'>;

export type GlbExportError =
  | { readonly code: 'structure-issues'; readonly issues: readonly Issue[] }
  | { readonly code: 'unplaced-parts'; readonly partIds: readonly string[] }
  | { readonly code: 'invalid-port-id'; readonly id: string }
  | { readonly code: 'invalid-palette-color'; readonly key: string }
  | { readonly code: 'invalid-palette-finish'; readonly key: string }
  | { readonly code: 'invalid-asset-file'; readonly file: string };

export type GlbExportResult =
  | { readonly ok: true; readonly glb: Uint8Array }
  | { readonly ok: false; readonly error: GlbExportError };

/** Signature only; the writer refuses unresolved/partly placed assemblies and invalid export metadata. */
export type ExportGlb = (input: GlbExportInput) => GlbExportResult;
