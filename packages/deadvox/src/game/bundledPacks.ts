import { type PackManifest, packRootOrder } from '../core/packAdmission.ts';

const manifests = {
  ...import.meta.glob<PackManifest>('../../mods/*/pack/manifest.json', { eager: true, import: 'default' }),
  ...import.meta.glob<PackManifest>('../../../mods/*/pack/manifest.json', { eager: true, import: 'default' }),
};

export const bundledPacks: readonly { root: string; manifest: PackManifest }[] = Object.entries(manifests)
  .map(([path, manifest]) => ({ root: path.slice(0, -'/pack/manifest.json'.length), manifest }))
  .sort((left, right) => packRootOrder(left.root, right.root));
