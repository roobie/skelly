import { BundleAdmission, type BundleStamp } from '../core/bundleAdmission.ts';
import { buildRegistry, type ContentSource } from '../core/content.ts';
import { admitPacks, type PackInput, packStartIssues } from '../core/packAdmission.ts';
import { bundledPacks } from './bundledPacks.ts';

declare const __SKELLY_BUNDLE_STAMP__: Record<string, BundleStamp> | undefined;
declare const __SKELLY_ADMISSION_FINGERPRINT__: string | undefined;
declare const __SKELLY_FILE_HASHES__: Record<string, string>;

const files = {
  ...import.meta.glob<unknown>('../../mods/*/*.json', { eager: true, import: 'default' }),
  ...import.meta.glob<unknown>('../../../mods/*/*.json', { eager: true, import: 'default' }),
};
const packs: PackInput[] = bundledPacks.map(({ root, manifest }) => ({
  source: root,
  manifest,
  files: manifest.files.map(({ path, kind }) => ({
    source: path,
    data: kind === 'content' ? files[`${root}/${path}`] : __SKELLY_FILE_HASHES__[`${root}/${path}`],
  })),
}));
export const bundledPackInputs: readonly PackInput[] = packs;
const admission = admitPacks(packs);
export const baseSources: readonly ContentSource[] = admission.sources;
export type StartupContent = ReturnType<typeof buildRegistry> & { defaultStart?: string | undefined };

const admissions = await Promise.all(
  admission.packs.map(async (pack) => ({
    pack,
    admission: await BundleAdmission.preparePack(
      pack,
      __SKELLY_BUNDLE_STAMP__?.[pack.manifest.id],
      __SKELLY_ADMISSION_FINGERPRINT__,
    ),
  })),
);
const bundle = BundleAdmission.combine(admissions);

export const buildBundledContent = (
  mods: readonly PackInput[] = [],
  modsSelected = mods.length > 0,
): StartupContent => {
  const selected = admitPacks([...packs, ...mods]);
  const result = buildRegistry(selected.sources, { bundle, modsSelected });
  result.issues.unshift(...selected.issues, ...packStartIssues(selected.packs, result.registry));
  return {
    ...result,
    defaultStart: selected.packs.findLast(({ manifest }) => manifest.defaultStart !== undefined)?.manifest.defaultStart,
  };
};
