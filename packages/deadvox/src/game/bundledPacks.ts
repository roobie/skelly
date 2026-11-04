import type { PackManifest } from '../core/packAdmission.ts';

const manifests = {
  ...import.meta.glob<PackManifest>('../../mods/*/pack/manifest.json', { eager: true, import: 'default' }),
  ...import.meta.glob<PackManifest>('../../../mods/*/pack/manifest.json', { eager: true, import: 'default' }),
};

export const bundledPacks: readonly { root: string; manifest: PackManifest }[] = Object.entries(manifests)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, manifest]) => ({ root: path.slice(0, -'/pack/manifest.json'.length), manifest }));
