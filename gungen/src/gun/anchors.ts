import type { NamedAnchors, PartAnchorDeclaration } from '../core/design.ts';

/** Gun-domain names; core treats these as caller-supplied strings. */
export type GunAnchorName = 'hold' | 'support' | 'muzzle';

export type GunPartAnchors = NamedAnchors<GunAnchorName>;

/** Domain-specific family declaration; returned frames are local to that part. */
export type GunPartAnchorDeclaration = PartAnchorDeclaration<GunAnchorName>;

/** `grip` includes a standalone grip or an integrated firing grip; stock wrists are fallback. */
export type GunHoldAnchorRank = 'grip' | 'firing-grip-stock';
export type GunHoldAnchorPrecedence = readonly ['grip', 'firing-grip-stock'];

export interface GunAnchorDeclaration {
  readonly anchors: GunPartAnchorDeclaration;
  /** Required for a declaration that supplies `hold`; equal-rank candidates are ambiguous. */
  readonly holdRank?: GunHoldAnchorRank;
}

/** Part family -> named local anchors and optional hold-candidate rank. */
export type GunAnchorDeclarations = Readonly<Record<string, GunAnchorDeclaration>>;

/** Gun policy to be applied after generic core anchor resolution. */
export interface GunAnchorSelectionPolicy {
  readonly holdPrecedence: GunHoldAnchorPrecedence;
  readonly equalRank: 'ambiguous';
}

// Keep AnchorFrame named at the domain boundary without redefining its core shape.
export type { AnchorFrame } from '../core/design.ts';
