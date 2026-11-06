import { BundleAdmission, type BundleStamp } from '../core/bundleAdmission.ts';
import { buildRegistry, type ContentSource } from '../core/content.ts';
import { admitPacks, type PackInput, packStartIssues } from '../core/packAdmission.ts';
import type { SaveVersionComponents } from '../core/saveFormat.ts';
import { bundledPacks } from './bundledPacks.ts';

declare const __SKELLY_BUNDLE_STAMP__: Record<string, BundleStamp> | undefined;
declare const __SKELLY_ADMISSION_FINGERPRINT__: string | undefined;
declare const __SKELLY_FILE_HASHES__: Record<string, string>;
declare const __SKELLY_OPT_IN_PACKS__: SaveVersionComponents['contentPacks'];

const files = {
  ...import.meta.glob<unknown>('../../mods/*/*.json', { eager: true, import: 'default' }),
  ...import.meta.glob<unknown>('../../../mods/*/*.json', { eager: true, import: 'default' }),
};
const available: PackInput[] = bundledPacks.map(({ root, manifest }) => ({
  source: root,
  manifest,
  files: manifest.files.map(({ path, kind }) => ({
    source: path,
    data: kind === 'content' ? files[`${root}/${path}`] : __SKELLY_FILE_HASHES__[`${root}/${path}`],
  })),
}));
const packs = available.filter(({ manifest }) => !manifest.optIn);
export const bundledPackInputs: readonly PackInput[] = packs;
/** Every shipped pack, opt-in ones included, for selecting an opt-in pack's closure. */
export const availablePackInputs: readonly PackInput[] = available;
const admission = admitPacks(packs);
export const baseSources: readonly ContentSource[] = admission.sources;
export type StartupContent = ReturnType<typeof buildRegistry> & { defaultStart?: string | undefined };

/** The build's identity entry for an opt-in pack, hashed once at build time. */
export const optInPackIdentity = (pack: PackInput): SaveVersionComponents['contentPacks'][number] => {
  const identity = __SKELLY_OPT_IN_PACKS__.find(({ id }) => id === pack.manifest.id);
  if (!identity) {
    throw new Error(`Pack ${pack.manifest.id} has no opt-in build identity`);
  }
  return identity;
};

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
