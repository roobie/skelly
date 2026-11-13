import { BundleAdmission, type BundleStamp } from '../core/bundleAdmission.ts';
import { compareCodeUnits } from '../core/codeUnitOrder.ts';
import { buildRegistry, type ContentSource } from '../core/content.ts';
import {
  admitPacks,
  type PackInput,
  type PackManifest,
  packStartIssues,
  selectFolderClosure,
} from '../core/packAdmission.ts';
import { logicalKey } from '../core/packFiles.ts';
import type { SaveVersionComponents } from '../core/saveFormat.ts';

declare const __SKELLY_BUNDLE_STAMP__: Record<string, BundleStamp> | undefined;
declare const __SKELLY_ADMISSION_FINGERPRINT__: string | undefined;
declare const __SKELLY_FILE_HASHES__: Record<string, string>;
declare const __SKELLY_OPT_IN_PACKS__: SaveVersionComponents['contentPacks'];

const MANIFEST_SUFFIX = '/pack/manifest.json';

/** A shipped pack: its root, as the product's manifest key names it, and its manifest. */
export interface BundledPack {
  readonly root: string;
  readonly manifest: PackManifest;
}

/** The product's shipped packs, ordered by root, from manifests keyed by `<root>/pack/manifest.json`. */
export const bundledPacksFrom = (manifests: Readonly<Record<string, PackManifest>>): readonly BundledPack[] =>
  Object.entries(manifests)
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([path, manifest]) => ({ root: path.slice(0, -MANIFEST_SUFFIX.length), manifest }));

/** The product's shipped packs and their content, read by the product; this module names no pack root. */
export interface BundledContentSources {
  readonly entryPack: string;
  /** Every shipped pack; see `bundledPacksFrom`. */
  readonly packs: readonly BundledPack[];
  /** Content files keyed by `<root>/<path>`, each path as its manifest lists it. */
  readonly files: Readonly<Record<string, unknown>>;
}

export type StartupContent = ReturnType<typeof buildRegistry> & {
  defaultStart?: string | undefined;
  /** The one start row of the page's `start-mod`; see `startSelection.ts`, `runStartId`. */
  startModStart?: string | undefined;
};

export interface BundledContent {
  /** The entry pack's manifest id, whose closure is the base stack every page loads. */
  readonly entryPack: string;
  /** The entry pack's dependency closure, admitted without mod selection. */
  readonly bundledPackInputs: readonly PackInput[];
  /** Every shipped pack, opt-in ones included, for selecting an opt-in pack's closure. */
  readonly availablePackInputs: readonly PackInput[];
  readonly baseSources: readonly ContentSource[];
  readonly buildBundledContent: (mods?: readonly PackInput[], modsSelected?: boolean) => StartupContent;
}

/** The build's identity entry for an opt-in pack, hashed once at build time. */
export const optInPackIdentity = (pack: PackInput): SaveVersionComponents['contentPacks'][number] => {
  const identity = __SKELLY_OPT_IN_PACKS__.find(({ id }) => id === pack.manifest.id);
  if (!identity) {
    throw new Error(`Pack ${pack.manifest.id} has no opt-in build identity`);
  }
  return identity;
};

/** Admits the product's shipped packs once and prepares their bundle proof. */
export const createBundledContent = async ({
  packs: bundledPacks,
  files,
  entryPack,
}: BundledContentSources): Promise<BundledContent> => {
  const available: PackInput[] = bundledPacks.map(({ root, manifest }) => ({
    source: root,
    manifest,
    files: manifest.files.map(({ path, kind }) => ({
      source: path,
      data: (kind === 'content' ? files : __SKELLY_FILE_HASHES__)[logicalKey({ root }, path)],
    })),
  }));
  const packs = selectFolderClosure([entryPack], available, []);
  const admission = admitPacks(packs);
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
  return {
    entryPack,
    bundledPackInputs: packs,
    availablePackInputs: available,
    baseSources: admission.sources,
    buildBundledContent: (mods = [], modsSelected = mods.length > 0) => {
      const selected = admitPacks([...packs, ...mods]);
      const result = buildRegistry(selected.sources, { bundle, modsSelected });
      result.issues.unshift(...selected.issues, ...packStartIssues(selected.packs, result.registry));
      return {
        ...result,
        defaultStart: selected.packs.findLast(({ manifest }) => manifest.defaultStart !== undefined)?.manifest
          .defaultStart,
      };
    },
  };
};
