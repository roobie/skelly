import type { GlbAssetIdentity } from '@skelly/thing-export/exportTypes.ts';
import { exportAttachmentGlb } from '../gun/attachmentExport.ts';
import { exportCartridgeModels } from '../gun/cartridgeExport.ts';
import type { DeadvoxModelEntry, GunDeadvoxModelEntry } from '../gun/exportGlb.ts';
import { readCartridge } from './readCartridge.ts';

export const boltCompanionExports = (
  model: GunDeadvoxModelEntry,
  optics: readonly GlbAssetIdentity[],
): { modelEntry: DeadvoxModelEntry; glb: Uint8Array }[] => {
  const cartridge = readCartridge(model.gun.calibre);
  if (!(cartridge.ok && cartridge.cartridge)) {
    throw new Error(`calibre: ${cartridge.ok ? 'bolt export requires a cartridge' : cartridge.message}`);
  }
  const ammunition = exportCartridgeModels(cartridge.cartridge);
  if (!ammunition.ok) {
    throw new Error(JSON.stringify(ammunition.error));
  }
  const exports = Object.values(ammunition.models);
  const compatible = new Set(Object.values(model.gun.compatibility ?? {}).flat());
  for (const asset of optics) {
    const attachment = asset.id.replaceAll('_', '-');
    if (!compatible.has(attachment)) {
      continue;
    }
    const optic = exportAttachmentGlb(attachment, asset);
    if (!optic.ok) {
      throw new Error(JSON.stringify(optic.error));
    }
    exports.push(optic);
  }
  return exports;
};
