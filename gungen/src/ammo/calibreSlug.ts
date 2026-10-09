import type { GlbAssetIdentity } from '@skelly/engine/core/design.ts';

/**
 * Convert a source cartridge id to the restricted deadvox model/file slug.
 * The original id remains in `calibre`; this is only for model ids and paths.
 */
const CALIBRE_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const calibreSlug = (id: string): string => {
  if (!CALIBRE_ID_PATTERN.test(id)) {
    throw new Error(`invalid cartridge id for a model slug: ${JSON.stringify(id)}`);
  }
  return [...id]
    .map((character) => {
      if (character === '.') {
        return '_d_';
      }
      if (character === '-') {
        return '_h_';
      }
      if (character === '_') {
        return '_u_';
      }
      return character;
    })
    .join('');
};

export type CartridgeModelKind = 'round' | 'case';

/** Stable model id/file pair for a cartridge component. */
export const cartridgeModelAsset = (kind: CartridgeModelKind, calibre: string): GlbAssetIdentity => {
  const slug = calibreSlug(calibre);
  return { id: `${kind}_${slug}`, file: `assets/models/${kind}-${slug}.glb` };
};
