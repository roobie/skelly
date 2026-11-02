// biome-ignore-all lint/correctness/noNodejsModules: Vite build plugin, never browser code.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { Plugin } from 'vite';
import type { BundleStamp } from '../src/core/bundleAdmission.ts';
import { admitPacks, packContentHash } from '../src/core/packAdmission.ts';
import { bundledPackDefines, readBundledPacks } from './readBundledPacks.ts';
import { fingerprintSimulationSources } from './simulationFingerprint.ts';

const BUNDLE_STAMP_DEFINE = '__DEADVOX_BUNDLE_STAMP__';
const ADMISSION_FINGERPRINT_DEFINE = '__DEADVOX_ADMISSION_FINGERPRINT__';
export const ADMISSION_ENTRIES = ['src/game/browserMods.ts', 'src/game/bundledMods.ts'];
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
    name: 'deadvox:validated-bundle',
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
      const selected = admitPacks(readBundledPacks(packageRoot));
      if (selected.issues.length > 0) {
        throw new Error(JSON.stringify(selected.issues));
      }
      const { packs } = selected;
      packHashes = await Promise.all(packs.map(packContentHash));
      for (const pack of packs) {
        snapshot.set(
          resolve(packageRoot, 'src/game', pack.source, 'pack/manifest.json'),
          JSON.stringify(pack.manifest),
        );
        pack.manifest.files.forEach(({ path, kind }, index) => {
          if (kind !== 'asset') {
            snapshot.set(resolve(packageRoot, 'src/game', pack.source, path), JSON.stringify(pack.files[index]!.data));
          }
        });
      }
      const stamp = JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--import',
            resolve(packageRoot, 'tools/register-mobgen-alias.mjs'),
            resolve(packageRoot, 'tools/stampBundle.ts'),
          ],
          { input: JSON.stringify({ packs, proofHash }), encoding: 'utf8', cwd: packageRoot },
        ),
      ) as Record<string, BundleStamp>;
      if (!config.define) {
        throw new Error('Bundle stamp defines must be configured before validation');
      }
      config.define[BUNDLE_STAMP_DEFINE] = JSON.stringify(stamp);
      config.define[ADMISSION_FINGERPRINT_DEFINE] = JSON.stringify(proofHash);
      Object.assign(config.define, await bundledPackDefines(packs));
    },
    load(id) {
      // The emitted JSON must be the exact input validated, even if a file is edited during the build.
      return snapshot.get(id);
    },
    async generateBundle() {
      if (packHashes) {
        const selected = admitPacks(readBundledPacks(packageRoot));
        const current = await Promise.all(selected.packs.map(packContentHash));
        if (selected.issues.length > 0) {
          this.error('Pack admission changed during bundle validation');
        }
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
