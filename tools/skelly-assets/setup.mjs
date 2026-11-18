// Installs skelly-assets' built packs from the pinned release into the submodule's built directory, where every reader looks.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compareCodeUnits } from '../../packages/engine/src/core/codeUnitOrder.ts';
import { download, extractTarGz, verifySha256 } from '../pinned-download.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');
export const PIN_PATH = 'tools/skelly-assets/release.json';
/** Records what the last install wrote, so a pin bump removes packs the new release drops. */
const STAMP_PATH = 'tools/skelly-assets/installed.json';
/** Holds the pinned release's archives between setups; each is verified against the pin before use, never trusted. */
export const ARCHIVES_PATH = 'tools/skelly-assets/archives';
const SUBMODULE = 'packages/skelly-assets';
export const MANIFEST = 'manifest.json';
const ARCHIVE_SUFFIX = '.tar.gz';
const MOD_ROOTS = ['packages/mods', 'packages/deadvox/mods'];

const DIGEST_PREFIX = /^sha256:/;

/**
 * A release's assets: where it is published and each asset's SHA-256 by name.
 * @typedef {{ repository: string, tag: string, sha256: Record<string, string> }} ReleaseAssets
 */
/** @typedef {ReleaseAssets & { commit: string }} ReleasePin */
/** @typedef {{ tag: string, sha256: Record<string, string | undefined> }} InstallStamp */
/** @typedef {import('../pinned-download.mjs').Fetcher} Fetcher */

/**
 * @param {string} path
 * @returns {unknown}
 */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
/**
 * @param {ReleaseAssets} pin
 * @param {string} name
 */
const assetUrl = (pin, name) => `https://github.com/${pin.repository}/releases/download/${pin.tag}/${name}`;
/**
 * Where an asset lands in the built directory: the manifest as itself, a pack archive as its pack directory.
 * @param {string} name
 */
const installedPath = (name) => (name.endsWith(ARCHIVE_SUFFIX) ? name.slice(0, -ARCHIVE_SUFFIX.length) : name);

/**
 * The release's packs that a skelly mod bundles. Skelly's mods are the one list of what it ships, so the release's
 * other packs, bundled only by other products, are never fetched.
 * @param {string} root
 * @param {ReleaseAssets} pin
 * @returns {string[]}
 */
export function bundledPackIds(root, pin) {
  const released = new Set(
    Object.keys(pin.sha256)
      .filter((name) => name.endsWith(ARCHIVE_SUFFIX))
      .map(installedPath),
  );
  return MOD_ROOTS.flatMap((modRoot) => {
    const directory = join(root, modRoot);
    return existsSync(directory)
      ? readdirSync(directory).map((name) => join(directory, name, 'pack/manifest.json'))
      : [];
  })
    .filter((manifest) => existsSync(manifest))
    .map((manifest) => /** @type {{ id: string }} */ (readJson(manifest)).id)
    .filter((id) => released.has(id))
    .sort();
}

/** Built output must match the sources skelly reads from the submodule, so the gitlink is the release tag's commit.
 * @param {string} root
 * @param {ReleasePin} pin
 */
function assertGitlinkMatchesRelease(root, pin) {
  const stage = execFileSync('git', ['-C', root, 'ls-files', '--stage', '--', SUBMODULE], { encoding: 'utf8' });
  const [, gitlink] = stage.split(' ');
  if (gitlink !== pin.commit) {
    throw new Error(
      `${SUBMODULE} is pinned at ${gitlink}, but ${PIN_PATH} names ${pin.tag} at ${pin.commit}: ` +
        'move the gitlink and the release pin together',
    );
  }
  if (!existsSync(join(root, SUBMODULE, '.git'))) {
    throw new Error(`${SUBMODULE} is not checked out: run git submodule update --init ${SUBMODULE}`);
  }
}

/** @param {Buffer} bytes */
const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * A pinned release asset's bytes, from `archiveDirectory` when they match the pin's digest and downloaded otherwise,
 * so a corrupted or partial cache restore is never read. `keep` stores a download there; a reader of another pin than
 * the installed one leaves it alone, because the cache holds one release's archives under their names.
 * @param {{ pin: ReleaseAssets, name: string, archiveDirectory: string, fetchImpl: Fetcher, keep: boolean }} options
 * @returns {Promise<Buffer>}
 */
export async function releaseAsset({ pin, name, archiveDirectory, fetchImpl, keep }) {
  const label = `skelly-assets ${pin.tag} ${name}`;
  const expectedHash = pin.sha256[name];
  if (expectedHash === undefined) {
    throw new Error(`${label} has no pinned SHA-256`);
  }
  const cachedPath = join(archiveDirectory, name);
  const cached = existsSync(cachedPath) ? readFileSync(cachedPath) : undefined;
  if (cached && sha256Hex(cached) === expectedHash) {
    return cached;
  }
  const asset = await download(assetUrl(pin, name), label, { fetchImpl });
  verifySha256(asset, expectedHash, label);
  if (keep) {
    mkdirSync(archiveDirectory, { recursive: true });
    writeFileSync(cachedPath, asset);
  }
  return asset;
}

/**
 * Serves every asset as `releaseAsset` does, so only verified bytes reach `builtDirectory`. Downloads are verified
 * before any install, and each pack directory is then replaced outright, because a file left from an older release
 * would be read as declared.
 * @param {{
 *   pin: ReleaseAssets,
 *   packIds: string[],
 *   builtDirectory: string,
 *   stampPath: string,
 *   archiveDirectory: string,
 *   fetchImpl: Fetcher,
 * }} options
 */
export async function installRelease({ pin, packIds, builtDirectory, stampPath, archiveDirectory, fetchImpl }) {
  const archiveNames = packIds.map((id) => `${id}${ARCHIVE_SUFFIX}`);
  const names = [MANIFEST, ...archiveNames];
  /** @type {InstallStamp} */
  const wanted = { tag: pin.tag, sha256: Object.fromEntries(names.map((name) => [name, pin.sha256[name]])) };
  const previous = existsSync(stampPath) ? /** @type {InstallStamp} */ (readJson(stampPath)) : undefined;
  /** @param {string} name */
  const fetchAsset = (name) => releaseAsset({ pin, name, archiveDirectory, fetchImpl, keep: true });
  const [manifest, packs] = await Promise.all([
    fetchAsset(MANIFEST),
    Promise.all(packIds.map(async (id) => ({ id, archive: await fetchAsset(`${id}${ARCHIVE_SUFFIX}`) }))),
  ]);

  rmSync(stampPath, { force: true });
  mkdirSync(builtDirectory, { recursive: true });
  const dropped = Object.keys(previous?.sha256 ?? {}).filter((name) => name !== MANIFEST && !names.includes(name));
  for (const name of dropped) {
    rmSync(join(builtDirectory, installedPath(name)), { recursive: true, force: true });
  }
  writeFileSync(join(builtDirectory, MANIFEST), manifest);
  for (const { id, archive } of packs) {
    installPack(id, archive, builtDirectory);
  }
  writeFileSync(stampPath, `${JSON.stringify(wanted, null, 2)}\n`);
}

/**
 * @param {string} id
 * @param {Buffer} archive
 * @param {string} builtDirectory
 */
function installPack(id, archive, builtDirectory) {
  const { directory, unpacked } = extractTarGz(archive);
  try {
    const top = readdirSync(unpacked);
    if (top.length !== 1 || top[0] !== id) {
      throw new Error(`skelly-assets ${id}${ARCHIVE_SUFFIX} must hold only ${id}/, found ${top.join(', ')}`);
    }
    const target = join(builtDirectory, id);
    rmSync(target, { recursive: true, force: true });
    cpSync(join(unpacked, id), target, { recursive: true });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function ensureSkellyAssets(root = REPOSITORY_ROOT) {
  const pin = /** @type {ReleasePin} */ (readJson(join(root, PIN_PATH)));
  assertGitlinkMatchesRelease(root, pin);
  await installRelease({
    pin,
    packIds: bundledPackIds(root, pin),
    builtDirectory: join(root, SUBMODULE, 'built'),
    stampPath: join(root, STAMP_PATH),
    archiveDirectory: join(root, ARCHIVES_PATH),
    fetchImpl: fetch,
  });
  process.stdout.write(`Installed skelly-assets ${pin.tag} into ${SUBMODULE}/built.\n`);
}

/**
 * The GitHub API's answers that pinning reads: a release's assets, and the object a tag ref or annotated tag names.
 * @typedef {{ assets: { name: string, digest: string }[] }} GitHubRelease
 * @typedef {{ object: { type: string, sha: string } }} GitHubTagRef
 */

/**
 * Rewrites the pin from a published release: the tag's commit and every asset's digest as GitHub reports it.
 * @param {string} tag
 * @param {string} [root]
 */
async function pinRelease(tag, root = REPOSITORY_ROOT) {
  const { repository } = /** @type {ReleasePin} */ (readJson(join(root, PIN_PATH)));
  /**
   * @param {string} path
   * @returns {Promise<unknown>}
   */
  const api = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`);
    if (!response.ok) {
      throw new Error(`GitHub API ${path}: ${response.status} ${response.statusText}`);
    }
    return response.json();
  };
  const release = /** @type {GitHubRelease} */ (await api(`releases/tags/${tag}`));
  let target = /** @type {GitHubTagRef} */ (await api(`git/ref/tags/${tag}`)).object;
  while (target.type === 'tag') {
    // biome-ignore lint/performance/noAwaitInLoops: each annotated tag names the next object to read.
    target = /** @type {GitHubTagRef} */ (await api(`git/tags/${target.sha}`)).object;
  }
  const sha256 = Object.fromEntries(
    release.assets
      .sort((left, right) => compareCodeUnits(left.name, right.name))
      .map(({ name, digest }) => [name, digest.replace(DIGEST_PREFIX, '')]),
  );
  const pin = { repository, tag, commit: target.sha, sha256 };
  writeFileSync(join(root, PIN_PATH), `${JSON.stringify(pin, null, 2)}\n`);
  process.stdout.write(`Pinned skelly-assets ${tag} at ${target.sha}; move ${SUBMODULE} to that commit.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const [flag, tag] = process.argv.slice(2);
    if (flag !== '--pin') {
      await ensureSkellyAssets();
    } else if (tag === undefined) {
      throw new Error('usage: node tools/skelly-assets/setup.mjs --pin <release tag>');
    } else {
      await pinRelease(tag);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
