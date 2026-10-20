// biome-ignore-all lint/correctness/noNodejsModules: Vite build plugin, never browser code.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { Plugin } from 'vite';
import type { BundleStamp } from '../src/core/bundleAdmission.ts';
import type { ContentSource } from '../src/core/content.ts';
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
      const directory = resolve(packageRoot, 'src/content/base');
      const sources: ContentSource[] = readdirSync(directory)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          const data: unknown = JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
          snapshot.set(resolve(directory, name), JSON.stringify(data));
          return { source: `../content/base/${name}`, data };
        })
        .sort((a, b) => a.source.localeCompare(b.source));
      const stamp = JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--import',
            resolve(packageRoot, 'tools/register-mobgen-alias.mjs'),
            resolve(packageRoot, 'tools/stampBundle.ts'),
          ],
          { input: JSON.stringify({ sources, proofHash }), encoding: 'utf8', cwd: packageRoot },
        ),
      ) as BundleStamp;
      if (!config.define) {
        throw new Error('Bundle stamp defines must be configured before validation');
      }
      config.define[BUNDLE_STAMP_DEFINE] = JSON.stringify(stamp);
      config.define[ADMISSION_FINGERPRINT_DEFINE] = JSON.stringify(proofHash);
    },
    load(id) {
      // The emitted JSON must be the exact input validated, even if a file is edited during the build.
      return snapshot.get(id);
    },
    async generateBundle() {
      if (fingerprint && (await fingerprint()) !== proofHash) {
        this.error('Admission sources changed during bundle validation; rebuild from a stable source tree');
      }
    },
  };
}
