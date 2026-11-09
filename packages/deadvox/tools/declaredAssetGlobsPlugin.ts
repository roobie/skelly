// biome-ignore lint/correctness/noNodejsModules: Vite build-time plugin, never imported by the product.
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { PackInput } from '../src/core/packAdmission.ts';
import { EXTERNAL_ASSET_ROOT } from '../src/product/externalRoot.ts';
import { packFileOrigin } from './readBundledPacks.ts';

/** Runtime URL filtering cannot undo asset emission or inlined payloads. */
export const declaredAssetGlobsPlugin = (
  packageRoot: string,
  packs: readonly PackInput[],
  external = EXTERNAL_ASSET_ROOT,
) => {
  const models: string[] = [];
  const figures: string[] = [];
  for (const pack of packs) {
    const figurePaths = new Set(
      pack.files.flatMap(({ data }) =>
        ((data as { actorFigures?: { body: string; clips: string; mesh: string }[] }).actorFigures ?? []).flatMap(
          ({ body, clips, mesh }) => [body, clips, mesh],
        ),
      ),
    );
    for (const { path, kind } of pack.manifest.files) {
      if (kind === 'content' || packFileOrigin(packageRoot, pack, path, external) !== 'external') {
        continue;
      }
      const physical = `${external}/${pack.manifest.id}/${path}`;
      if (path.endsWith('.glb')) {
        models.push(physical);
      }
      if (figurePaths.has(path)) {
        figures.push(physical);
      }
    }
  }
  return {
    name: 'skelly:declared-asset-globs',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== resolve(packageRoot, 'src/product/assets.ts')) {
        return;
      }
      return code
        .replace("'@skelly/released-models'", models.map((path) => JSON.stringify(path)).join(','))
        .replace("'@skelly/released-figures'", figures.map((path) => JSON.stringify(path)).join(','));
    },
  } satisfies Plugin;
};
