import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { singlePart } from '@skelly/thing-core/single-part';
import { drawnGeometry } from '@skelly/thing-export/drawn.ts';
import type { GlbAssetIdentity, GlbExportError, VoxelGrains } from '@skelly/thing-export/exportTypes.ts';
import { modelParts } from '@skelly/thing-export/physical.ts';
import { PART_CATALOGUE, type PartCatalogue } from '../gun/catalogue.ts';
import { gunDomain } from '../gun/domain.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from '../gun/exportGlb.ts';
import { exportGunGeometry } from '../gun/glbWriter.ts';
import { GUN_PALETTE } from '../gun/palette.ts';

export type PartExportResult =
  | { readonly ok: true; readonly glb: Uint8Array; readonly modelEntry: DeadvoxModelEntry }
  | { readonly ok: false; readonly error: GlbExportError };

/**
 * Exports one catalogue item as a loose part: built from the item's own params, drawn in its own finish and weighed by
 * its authored mass, so it looks and weighs as it does fitted.
 */
export const exportPartItem = (
  itemId: string,
  asset: GlbAssetIdentity,
  voxel: Partial<VoxelGrains> = {},
  catalogue: PartCatalogue = PART_CATALOGUE,
): PartExportResult => {
  const item = catalogue.items.get(itemId);
  if (!item) {
    throw new Error(`unknown part item ${itemId}`);
  }
  const family = gunDomain.families[item.family]!;
  // Placement only positions the part within a gun; a loose part takes the family's default.
  const placement = Object.fromEntries(
    Object.entries(family.params)
      .filter(([name]) => catalogue.placementParams.has(name))
      .map(([name, spec]) => [name, spec.default]),
  );
  // A part's motion travels along its host's keep-out, so a loose part has none.
  const { motion: _motion, ...built } = family.build({ ...placement, ...item.params });
  // A loose part keeps its mount frames, but nothing has to be fitted to it.
  const part = { ...built, ports: built.ports.map((port) => ({ ...port, required: false })) };
  const single = singlePart({ id: item.id, part, massKg: item.massKg, units: gunDomain.units });
  const resolved = resolve(single.assembly, single.domain);
  const result = exportGunGeometry({
    resolved,
    palette: GUN_PALETTE,
    appearance: { finish: item.finish },
    asset,
    ...voxel,
  });
  if (!result.ok) {
    return result;
  }
  const parts = modelParts(resolved, (id, def) => ({ part: def, massKg: single.masses[id]!, item: item.id }), {
    drawn: drawnGeometry(resolved, voxel),
  });
  return {
    ok: true,
    glb: result.glb,
    modelEntry: { id: asset.id, file: asset.file as DeadvoxModelFile, gun: {}, parts },
  };
};
