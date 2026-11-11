import { type PackManifest, selectFolderClosure } from '@skelly/engine/packs';

export const PRODUCT_ENTRY_PACK = 'skelly.deadvox';

/** Unrelated folders must not affect play, while opt-ins need their dependencies available for selection. */
export const selectAvailableProductPacks = <T extends { readonly manifest: PackManifest }>(packs: readonly T[]): T[] =>
  selectFolderClosure(
    [PRODUCT_ENTRY_PACK, ...packs.filter(({ manifest }) => manifest.optIn).map(({ manifest }) => manifest.id)],
    packs,
    [],
  );
