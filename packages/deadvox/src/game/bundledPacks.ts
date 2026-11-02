import baseManifest from '../content/base/pack/manifest.json' with { type: 'json' };
import type { PackManifest } from '../core/packAdmission.ts';

export const bundledPacks: readonly { root: string; manifest: PackManifest }[] = [
  { root: '../content/base', manifest: baseManifest as PackManifest },
];
