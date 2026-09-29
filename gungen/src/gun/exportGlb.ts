import type { AnchorSelectionError, GlbAssetIdentity, GlbExportError, GlbExportResult } from '../core/design.ts';
import { exportGlb } from '../core/glb.ts';
import { resolve } from '../core/resolve.ts';
import type { Assembly } from '../core/schema.ts';
import { GUN_ANCHORS } from './anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from './anchors.ts';
import { gunDomain } from './domain.ts';
import { GUN_PALETTE } from './palette.ts';

export type GunExportResult =
  | Extract<GlbExportResult, { ok: true }>
  | { readonly ok: false; readonly error: GlbExportError | AnchorSelectionError };

/**
 * Exports a gun assembly: resolves it, selects the gun's anchors (grip precedence) and hands the core writer
 * the gun palette. A structurally broken assembly is reported by the writer; a missing or ambiguous `hold`
 * comes back as the anchor selection error.
 */
export const exportGunGlb = (assembly: Assembly, asset: GlbAssetIdentity): GunExportResult => {
  const resolved = resolve(assembly, gunDomain);
  // Anchor selection needs placed parts; a broken assembly gets the writer's own structure report first.
  if (resolved.issues.length > 0 || resolved.placed.size < Object.keys(assembly.parts).length) {
    const probe = exportGlb({
      resolved,
      anchors: { hold: { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] }, others: {} },
      palette: GUN_PALETTE,
      asset,
    });
    if (!probe.ok) {
      return probe;
    }
  }
  const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
  if ('code' in anchors) {
    return { ok: false, error: anchors };
  }
  return exportGlb({ resolved, anchors, palette: GUN_PALETTE, asset });
};
