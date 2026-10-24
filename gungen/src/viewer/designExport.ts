import type { Cartridge } from '../ammo/cartridge.ts';
import { loadGunDesign } from '../gun/designLoader.ts';
import { gunDomain } from '../gun/domain.ts';
import { exportGunGlb, type GunAssetIdentity } from '../gun/exportGlb.ts';
import { type DesignEditorState, saveDesign } from './designEditor.ts';

/** Proposals remain saveable, but only item-backed body geometry can leave the editor as a model. */
export const exportEditorDesign = (state: DesignEditorState, asset: GunAssetIdentity, cartridge?: Cartridge) => {
  const saved = saveDesign(state, gunDomain);
  if (!saved.ok) {
    return { ok: false as const, message: saved.reason };
  }
  const loaded = loadGunDesign(saved.text);
  if (!loaded.ok || loaded.issues.length > 0) {
    return { ok: false as const, message: 'Resolve design issues before exporting.' };
  }
  const { design } = loaded;
  if (design.calibre && cartridge?.id !== design.calibre) {
    return { ok: false as const, message: 'Select the design cartridge before exporting.' };
  }
  const result = exportGunGlb(
    design.assembly,
    asset,
    {
      appearanceProfile: design.template,
      ...(design.finish ? { finish: design.finish } : {}),
    },
    {
      items: design.items ?? {},
      ...(cartridge ? { cartridge } : {}),
      ...(design.excludedAttachments ? { excludedAttachments: design.excludedAttachments } : {}),
    },
  );
  if (!result.ok) {
    return { ok: false as const, message: JSON.stringify(result.error) };
  }
  const parts = Object.values(result.modelEntry.parts ?? {});
  if (parts.length === 0 || parts.some((part) => !part.item)) {
    return { ok: false as const, message: 'Choose catalogue items for every body part before exporting.' };
  }
  return result;
};
