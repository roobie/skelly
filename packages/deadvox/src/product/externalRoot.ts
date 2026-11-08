/**
 * The root of skelly-assets' built files, relative to the product modules as pack roots are (`src/product/packs.ts`,
 * `bundledPacks`). `<root>/<pack id>/` holds the files that pack declares; a directory naming no bundled pack belongs to
 * another product and is never read.
 */
export const EXTERNAL_ASSET_ROOT = '../../../skelly-assets/built';
