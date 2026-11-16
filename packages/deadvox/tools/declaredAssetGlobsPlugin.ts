// biome-ignore lint/correctness/noNodejsModules: Vite build-time plugin, never imported by the product.
import { resolve } from 'node:path';
import type { PackInput } from '@skelly/engine/packs';
import type { Plugin } from 'vite';
import { EXTERNAL_ASSET_ROOT } from '../src/product/externalRoot.ts';
import { packFileOrigin } from './readBundledPacks.ts';

interface ExternalFile {
  readonly path: string;
  readonly physical: string;
  readonly figure: boolean;
}

const figurePathsOf = (pack: PackInput): ReadonlySet<string> =>
  new Set(
    pack.files.flatMap(({ data }) =>
      ((data as { actorFigures?: { body: string; clips: string; mesh: string }[] }).actorFigures ?? []).flatMap(
        ({ body, clips, mesh }) => [body, clips, mesh],
      ),
    ),
  );

const externalFiles = (packageRoot: string, packs: readonly PackInput[], external: string): ExternalFile[] =>
  packs.flatMap((pack) => {
    const figurePaths = figurePathsOf(pack);
    return pack.manifest.files
      .filter(
        ({ path, kind }) => kind !== 'content' && packFileOrigin(packageRoot, pack, path, external) === 'external',
      )
      .map(({ path }) => ({
        path,
        physical: `${external}/${pack.manifest.id}/${path}`,
        figure: figurePaths.has(path),
      }));
  });

const globList = (files: readonly ExternalFile[], keep: (file: ExternalFile) => boolean): string =>
  files
    .filter(keep)
    .map(({ physical }) => JSON.stringify(physical))
    .join(',');

/**
 * Runtime URL filtering cannot undo asset emission or inlined payloads. Relative wildcard placeholders also remain valid
 * when Vite's dependency scanner reads the source without this transform.
 */
export const declaredAssetGlobsPlugin = (
  packageRoot: string,
  packs: readonly PackInput[],
  external = EXTERNAL_ASSET_ROOT,
) => {
  const files = externalFiles(packageRoot, packs, external);
  const models = globList(files, ({ path }) => path.endsWith('.glb'));
  const audio = globList(files, ({ path }) => path.endsWith('.ogg'));
  const figures = globList(files, ({ figure }) => figure);
  return {
    name: 'skelly:declared-asset-globs',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== resolve(packageRoot, 'src/product/assets.ts')) {
        return;
      }
      return code
        .replace("'./@skelly/released-models/*.glb'", models)
        .replace("'./@skelly/released-audio/*.ogg'", audio)
        .replace("'./@skelly/released-figures/*.{glb,json}'", figures);
    },
  } satisfies Plugin;
};
