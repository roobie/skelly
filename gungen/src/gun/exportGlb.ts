import type { AppearanceContext, GlbAssetIdentity, GlbExportError, GlbExportResult } from '../core/design.ts';
import { exportGlb } from '../core/glb.ts';
import type { Vec3 } from '../core/math.ts';
import { resolve } from '../core/resolve.ts';
import type { Assembly } from '../core/schema.ts';
import { GUN_ANCHORS } from './anchorData.ts';
import { type AnchorSelectionError, GUN_ANCHOR_POLICY, type SelectedAnchors, selectGunAnchors } from './anchors.ts';
import { gunDomain } from './domain.ts';
import { gripTurn, toFileAxes } from './exportFrame.ts';
import { GUN_PALETTE } from './palette.ts';

export type DeadvoxModelFile = `assets/models/${string}.glb`;

export interface DeadvoxModelEntry {
  readonly id: string;
  readonly file: DeadvoxModelFile;
  readonly grip: { readonly at: Vec3; readonly turn: Vec3 };
  readonly anchors?: Readonly<Record<string, Vec3>>;
}

export type GunAssetIdentity = GlbAssetIdentity;

export type GunExportResult =
  | { readonly ok: true; readonly glb: Uint8Array; readonly modelEntry: DeadvoxModelEntry }
  | { readonly ok: false; readonly error: GlbExportError | AnchorSelectionError };

const round6 = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
};

const modelPoint = (point: Vec3, metresPerUnit: number): Vec3 => {
  const [x, y, z] = toFileAxes(point);
  return [round6(x * metresPerUnit), round6(y * metresPerUnit), round6(z * metresPerUnit)];
};

export const createGunModelEntry = (
  asset: GunAssetIdentity,
  anchors: SelectedAnchors,
  metresPerUnit: number,
): DeadvoxModelEntry => {
  const others = Object.entries(anchors.others).map(([name, frame]): [string, Vec3] => [
    name,
    modelPoint(frame.position, metresPerUnit),
  ]);
  return {
    id: asset.id,
    file: asset.file as DeadvoxModelFile,
    grip: { at: modelPoint(anchors.hold.position, metresPerUnit), turn: gripTurn() },
    ...(others.length > 0 ? { anchors: Object.fromEntries(others) } : {}),
  };
};

/**
 * Exports a gun assembly: core writes the GLB, then this adapter selects gun anchors and builds the Deadvox entry.
 * The public gun export retains its established model-entry shape and byte/axis conversion.
 */
export const exportGunGlb = (
  assembly: Assembly,
  asset: GunAssetIdentity,
  appearance: AppearanceContext,
): GunExportResult => {
  const resolved = resolve(assembly, gunDomain);
  // Broken assemblies get the core writer's structure report before anchor selection.
  if (resolved.issues.length > 0 || resolved.placed.size < Object.keys(assembly.parts).length) {
    const probe = exportGlb({ resolved, palette: GUN_PALETTE, appearance, asset });
    if (!probe.ok) {
      return probe;
    }
  }
  const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
  if ('code' in anchors) {
    return { ok: false, error: anchors };
  }
  const result: GlbExportResult = exportGlb({ resolved, palette: GUN_PALETTE, appearance, asset });
  if (!result.ok) {
    return result;
  }
  return {
    ...result,
    modelEntry: createGunModelEntry(asset, anchors, resolved.domain.units.metresPerUnit),
  };
};
