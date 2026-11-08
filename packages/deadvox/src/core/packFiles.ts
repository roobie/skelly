import type { ContentIssue } from './content.ts';
import type { PackManifest } from './packAdmission.ts';

/**
 * Where a pack's files live. A manifest declares each file once by its logical path; the file may sit under the
 * pack's root or, for a json or asset entry, under an external root shared by products, in the namespace named by
 * the pack's id. Every key shape is built here, so the hash key, the content key and the physical locations
 * cannot drift apart.
 */

/** A pack as its product finds it: the root its manifest key names, and its manifest. */
export interface PackLocation {
  readonly root: string;
  readonly manifest: Pick<PackManifest, 'id' | 'files'>;
}
export type PackFileEntry = PackManifest['files'][number];

/** The key a declared file is hashed, globbed and admitted by, wherever its bytes live. */
export const logicalKey = ({ root }: Pick<PackLocation, 'root'>, path: string): string => `${root}/${path}`;

/** Where an entry may live. Content stays under its pack's root; json and asset entries may also be external. */
const physicalCandidates = (pack: PackLocation, entry: PackFileEntry, external?: string): string[] =>
  entry.kind === 'content' || external === undefined
    ? [logicalKey(pack, entry.path)]
    : [logicalKey(pack, entry.path), `${external}/${pack.manifest.id}/${entry.path}`];

/** The one candidate the inventory holds, or the `files` issue when it holds none or more than one. */
export const resolvePhysical = (
  pack: PackLocation,
  entry: PackFileEntry,
  inventory: { has: (key: string) => boolean },
  external?: string,
): { key: string } | { issue: ContentIssue } => {
  const present = physicalCandidates(pack, entry, external).filter((key) => inventory.has(key));
  if (present.length === 1) {
    return { key: present[0]! };
  }
  const problem = present.length === 0 ? 'missing file' : 'file found in both roots';
  return { issue: { source: pack.root, path: 'files', message: `Pack ${pack.manifest.id}: ${problem} ${entry.path}` } };
};

/** The pack namespace a key under the external root names, or undefined for a key outside it. */
const externalNamespace = (physicalKey: string, external: string | undefined): string | undefined => {
  if (external === undefined || !physicalKey.startsWith(`${external}/`)) {
    return undefined;
  }
  const [namespace] = physicalKey.slice(external.length + 1).split('/');
  return namespace;
};

export type DeclaredAsset =
  | { readonly kind: 'declared'; readonly pack: PackLocation; readonly path: string }
  | { readonly kind: 'foreign' }
  | { readonly kind: 'orphan' };

/**
 * Which pack a physical key belongs to, for URL maps. Under the external root a namespace that is no bundled pack is
 * another product's and is ignored; inside a bundled namespace the key must be one of that pack's json or asset
 * entries. A key under a pack root belongs to that pack, so an unknown local asset is never silently dropped.
 */
export const declaredAsset = (
  packs: readonly PackLocation[],
  physicalKey: string,
  external?: string,
): DeclaredAsset => {
  const namespace = externalNamespace(physicalKey, external);
  if (namespace !== undefined) {
    const pack = packs.find(({ manifest }) => manifest.id === namespace);
    if (!pack) {
      return { kind: 'foreign' };
    }
    const path = physicalKey.slice(`${external}/${namespace}/`.length);
    return pack.manifest.files.some((entry) => entry.path === path && entry.kind !== 'content')
      ? { kind: 'declared', pack, path }
      : { kind: 'orphan' };
  }
  const pack = packs.find(({ root }) => physicalKey.startsWith(`${root}/`));
  return pack ? { kind: 'declared', pack, path: physicalKey.slice(pack.root.length + 1) } : { kind: 'orphan' };
};
