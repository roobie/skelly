// biome-ignore-all lint/correctness/noNodejsModules: Vite build plugin, never browser code.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { type BundleStamp, packContentHash } from '@skelly/engine/packs';
import type { Plugin } from 'vite';
import { PRODUCT_ENTRY_PACK, selectAvailableProductPacks } from '../src/product/packSelection.ts';
import { bundledPackDefines, PACK_ROOT_BASE, readAvailablePacks } from './readBundledPacks.ts';
import { fingerprintSimulationSources } from './simulationFingerprint.ts';

const BUNDLE_STAMP_DEFINE = '__SKELLY_BUNDLE_STAMP__';
const ADMISSION_FINGERPRINT_DEFINE = '__SKELLY_ADMISSION_FINGERPRINT__';
export const ADMISSION_ENTRIES = ['engine/game/browserMods.ts', 'engine/game/bundledMods.ts'];
export const UNSTAMPED_BUNDLE_DEFINES = {
  [BUNDLE_STAMP_DEFINE]: 'undefined',
  [ADMISSION_FINGERPRINT_DEFINE]: 'undefined',
};

export function bundleStampPlugin(packageRoot: string): Plugin {
  let fingerprint: (() => Promise<string>) | undefined;
  let proofHash: string | undefined;
  let packHashes: string[] | undefined;
  const snapshot = new Map<string, string>();
  return {
    name: 'skelly:validated-bundle',
    enforce: 'pre',
    async configResolved(config) {
      if (config.command !== 'build' || config.isWorker) {
        return;
      }
      const viteResolve = config.createResolver();
      fingerprint = () =>
        fingerprintSimulationSources(ADMISSION_ENTRIES, packageRoot, {
          resolve: async (specifier, importer) => viteResolve(specifier, importer),
          readFile: async (path) => readFileSync(path, 'utf8'),
        });
      proofHash = await fingerprint();
      const packs = selectAvailableProductPacks(readAvailablePacks(packageRoot));
      packHashes = await Promise.all(packs.map(packContentHash));
      for (const pack of packs) {
        snapshot.set(
          resolve(packageRoot, PACK_ROOT_BASE, pack.source, 'pack/manifest.json'),
          JSON.stringify(pack.manifest),
        );
        pack.manifest.files.forEach(({ path, kind }, index) => {
          if (kind === 'content') {
            snapshot.set(
              resolve(packageRoot, PACK_ROOT_BASE, pack.source, path),
              JSON.stringify(pack.files[index]!.data),
            );
          }
        });
      }
      const stamp = JSON.parse(
        execFileSync(process.execPath, [resolve(packageRoot, 'tools/stampBundle.ts')], {
          input: JSON.stringify({ packs, proofHash, entryPack: PRODUCT_ENTRY_PACK }),
          encoding: 'utf8',
          cwd: packageRoot,
        }),
      ) as Record<string, BundleStamp>;
      if (!config.define) {
        throw new Error('Bundle stamp defines must be configured before validation');
      }
      config.define[BUNDLE_STAMP_DEFINE] = JSON.stringify(stamp);
      config.define[ADMISSION_FINGERPRINT_DEFINE] = JSON.stringify(proofHash);
      Object.assign(config.define, await bundledPackDefines(packs, PRODUCT_ENTRY_PACK));
    },
    load(id) {
      // Emitted content must be the exact input validated, even if a file is edited during the build.
      return snapshot.get(id);
    },
    async generateBundle() {
      if (packHashes) {
        const packs = selectAvailableProductPacks(readAvailablePacks(packageRoot));
        const current = await Promise.all(packs.map(packContentHash));
        if (JSON.stringify(current) !== JSON.stringify(packHashes)) {
          this.error('Pack files changed during bundle validation; rebuild from a stable source tree');
        }
      }
      if (fingerprint && (await fingerprint()) !== proofHash) {
        this.error('Admission sources changed during bundle validation; rebuild from a stable source tree');
      }
    },
  };
}
