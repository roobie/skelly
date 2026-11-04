import baseManifest from '../../mods/skelly.deadvox.residual/pack/manifest.json' with { type: 'json' };
import type { PackManifest } from '../core/packAdmission.ts';

export const bundledPacks: readonly { root: string; manifest: PackManifest }[] = [
  { root: '../../mods/skelly.deadvox.residual', manifest: baseManifest as PackManifest },
];
