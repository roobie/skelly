import { resolveAnchors } from '../core/anchors.ts';
import type {
  AnchorFrame,
  AnchorSelectionError,
  NamedAnchors,
  PartAnchorDeclaration,
  ResolvedAnchors,
  SelectedAnchors,
} from '../core/design.ts';
import type { Resolved } from '../core/resolve.ts';

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

/**
 * Registry key -> named local anchors and optional hold-candidate rank.
 *
 * Keyed by the registry key (the key in `FAMILIES`, e.g. `'ak-receiver'`, the same string an assembly's
 * `PartInstance.family` holds), not by `PartDef.family`. Anchors depend on the geometry and params of the
 * builder recipe (`'frame'` and `'grip'` both build a firing grip, with different local frames), whereas
 * compatibility and rules use the `PartDef.family` role, which several recipes share.
 */
export type GunAnchorDeclarations = Readonly<Record<string, GunAnchorDeclaration>>;

/** Gun policy to be applied after generic core anchor resolution. */
export interface GunAnchorSelectionPolicy {
  readonly holdPrecedence: GunHoldAnchorPrecedence;
  readonly equalRank: 'ambiguous';
}

/** Signature only; gun-domain policy selects the hold before the generic core exporter runs. */
export type SelectGunAnchors = (
  resolved: Resolved,
  declarations: GunAnchorDeclarations,
  policy: GunAnchorSelectionPolicy,
) => SelectedAnchors | AnchorSelectionError;

/** The documented policy: a grip outranks a `FIRING_GRIP` stock; equal ranks are ambiguous. */
export const GUN_ANCHOR_POLICY: GunAnchorSelectionPolicy = {
  holdPrecedence: ['grip', 'firing-grip-stock'],
  equalRank: 'ambiguous',
};

const OTHER_ANCHORS = ['support', 'muzzle'] as const satisfies readonly GunAnchorName[];

/**
 * Resolves every declared anchor into assembly space (core), then applies the gun policy. The `hold` comes
 * from the best-ranked candidates; two candidates of that rank are ambiguous and no `hold` is an error.
 * Other names take the candidate on the lowest part id, so the choice is deterministic.
 */
export const selectGunAnchors: SelectGunAnchors = (resolved, declarations, policy) => {
  const frames = resolveAnchors(
    resolved,
    Object.fromEntries(Object.entries(declarations).map(([key, d]) => [key, d.anchors])),
  );
  const ids = Object.keys(frames).sort();
  const candidatesAt = (rank: GunHoldAnchorRank) =>
    ids.filter((id) => {
      const decl = declarations[resolved.assembly.parts[id]!.family]!;
      return frames[id]!.hold && decl.holdRank === rank;
    });
  for (const rank of policy.holdPrecedence) {
    const candidates = candidatesAt(rank);
    if (candidates.length > 1) {
      return { code: 'ambiguous-anchor', name: 'hold', candidates };
    }
    if (candidates.length === 1) {
      return selectOthers(frames, ids, frames[candidates[0]!]!.hold!);
    }
  }
  return { code: 'missing-required-anchor', name: 'hold' };
};

const selectOthers = (
  frames: ResolvedAnchors<GunAnchorName>,
  ids: readonly string[],
  hold: AnchorFrame,
): SelectedAnchors => {
  const others: Partial<Record<GunAnchorName, AnchorFrame>> = {};
  for (const name of OTHER_ANCHORS) {
    const id = ids.find((i) => frames[i]![name]);
    if (id) {
      others[name] = frames[id]![name]!;
    }
  }
  return { hold, others };
};

export type { AnchorFrame } from '../core/design.ts';
