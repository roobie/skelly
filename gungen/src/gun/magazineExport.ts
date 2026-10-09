import type {
  AppearanceContext,
  GlbAssetIdentity,
  GlbExportError,
  GlbExportResult,
} from '@skelly/engine/core/design.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Assembly, PartInstance } from '@skelly/engine/core/schema.ts';
import { calibreSlug } from '../ammo/calibreSlug.ts';
import type { MetallicCartridge } from '../ammo/cartridge.ts';
import { gunDomain } from './domain.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from './exportGlb.ts';
import { exportGunGeometry as exportGlb } from './glbWriter.ts';
import { magazineRoundColumn, magazineRoundPoses } from './magazineGeometry.ts';
import { GUN_PALETTE } from './palette.ts';

export interface MagazineExportInput {
  readonly asset: GlbAssetIdentity;
  readonly params: Readonly<Record<string, string>>;
  readonly cartridge: MetallicCartridge;
  readonly appearance?: AppearanceContext;
}

export type MagazineExportResult =
  | { readonly ok: true; readonly glb: Uint8Array; readonly modelEntry: DeadvoxModelEntry }
  | { readonly ok: false; readonly error: GlbExportError };

/** Exports one generated magazine as a detached model plus its full round-column metadata. */
export const exportMagazineGlb = (input: MagazineExportInput): MagazineExportResult => {
  calibreSlug(input.cartridge.id);
  const magazine: PartInstance = { family: 'magazine', params: input.params };
  const assembly: Assembly = {
    name: input.asset.id,
    root: 'magazine',
    parts: { magazine },
    connections: [],
  };
  const resolved = resolve(assembly, gunDomain);
  const output: GlbExportResult = exportGlb({
    resolved,
    palette: GUN_PALETTE,
    ...(input.appearance ? { appearance: input.appearance } : {}),
    asset: input.asset,
  });
  if (!output.ok) {
    return output;
  }
  const def = resolved.defs.get('magazine');
  if (!def) {
    throw new Error('resolved magazine has no part definition');
  }
  const { column } = magazineRoundColumn(def.displaySolids ?? def.solids, input.cartridge, input.params, def.solids);
  return {
    ok: true,
    glb: output.glb,
    modelEntry: {
      id: input.asset.id,
      file: input.asset.file as DeadvoxModelFile,
      calibre: input.cartridge.id,
      capacity: column.capacity,
      rounds: magazineRoundPoses(column),
    },
  };
};
