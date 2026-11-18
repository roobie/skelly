// Reports every bundled mob whose baked files differ between the base and head skelly-assets pins, and whether its
// genome changed or only the build did, so a pin bump PR shows each re-roll to its reviewer.
// Usage: node tools/skelly-assets/reroll-report.mjs --base <git revision>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compareCodeUnits } from '../../packages/engine/src/core/codeUnitOrder.ts';
import { extractTarGz } from '../pinned-download.mjs';
import { ARCHIVES_PATH, bundledPackIds, MANIFEST, PIN_PATH, releaseAsset } from './setup.mjs';

/** @typedef {import('./setup.mjs').ReleaseAssets} ReleaseAssets */
/** @typedef {import('../pinned-download.mjs').Fetcher} Fetcher */
/** @typedef {{ params?: Record<string, unknown>, [field: string]: unknown }} Genome */
/** @typedef {keyof typeof BAKED_FILES} BakedFile */
/** @typedef {{ files: Record<BakedFile, string>, genome?: Genome }} MobBuild */
/** @typedef {{ key: string, change: keyof typeof CHANGE_TEXT, files: BakedFile[], draws: string[] }} MobChange */
/** @typedef {{ id: string, kind: string, pack: string, path: string, body: string, clips: string, genome?: string }} ManifestModel */

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');
/** A mob's baked files by the name the report gives them, each the manifest field naming it; its genome is compared apart from them. */
const BAKED_FILES = /** @type {const} */ ({ glb: 'path', body: 'body', clips: 'clips' });
const BAKED_FILE_NAMES = /** @type {BakedFile[]} */ (Object.keys(BAKED_FILES));

/** @param {Buffer} bytes */
const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * JSON with every object's keys sorted, so two genomes compare by their values rather than their draw order.
 * @param {unknown} value
 */
const canonical = (value) =>
  JSON.stringify(value, (_key, field) =>
    field && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([left], [right]) => compareCodeUnits(left, right)))
      : field,
  );

/**
 * A genome's draws by name: its params as `params.<name>` beside its other fields.
 * @param {Genome} genome
 * @returns {Record<string, unknown>}
 */
const draws = ({ params, ...rest }) => ({
  ...rest,
  ...Object.fromEntries(Object.entries(params ?? {}).map(([name, value]) => [`params.${name}`, value])),
});

/**
 * Every mob present in both builds whose baked files differ, as `{ key, change, files, draws }`: `genome` when its
 * genome changed, `build` when the same genome baked other files, `unrecorded` when a build records no genome to
 * tell them apart. `files` names the baked files that differ and `draws` the genome values that changed. Builds map
 * `<pack>/<id>` to `{ files: file -> sha256, genome? }`, a file named as `BAKED_FILES` names it.
 * @param {Map<string, MobBuild>} before
 * @param {Map<string, MobBuild>} after
 * @returns {MobChange[]}
 */
export function mobChanges(before, after) {
  /** @type {MobChange[]} */
  const changes = [];
  for (const [key, old] of before) {
    const now = after.get(key);
    if (now === undefined) {
      continue;
    }
    const files = BAKED_FILE_NAMES.filter((file) => old.files[file] !== now.files[file]);
    if (files.length === 0) {
      continue;
    }
    if (old.genome === undefined || now.genome === undefined) {
      changes.push({ key, change: 'unrecorded', files, draws: [] });
      continue;
    }
    const [was, is] = [draws(old.genome), draws(now.genome)];
    const changed = [...new Set([...Object.keys(was), ...Object.keys(is)])]
      .filter((name) => canonical(was[name]) !== canonical(is[name]))
      .sort(compareCodeUnits);
    changes.push({ key, change: changed.length > 0 ? 'genome' : 'build', files, draws: changed });
  }
  return changes.sort((left, right) => compareCodeUnits(left.key, right.key));
}

const CHANGE_TEXT = {
  genome: 'genome changed: re-rolled',
  build: 'build only: same genome, other body',
  unrecorded: 'unknown: a pin records no genome',
};

/**
 * The report as Markdown, for the pin bump PR's checks summary.
 * @param {ReleaseAssets} basePin
 * @param {ReleaseAssets} headPin
 * @param {MobChange[]} changes
 */
export function reportMarkdown(basePin, headPin, changes) {
  const heading = `### Mob bodies, skelly-assets ${basePin.tag} to ${headPin.tag}`;
  if (changes.length === 0) {
    return `${heading}\n\nNo bundled mob's baked files changed.\n`;
  }
  const rows = changes.map(
    ({ key, change, files, draws: changed }) =>
      `| \`${key}\` | ${CHANGE_TEXT[change]} | ${files.join(', ')} | ${changed.join(', ')} |`,
  );
  return [heading, '', '| Mob | Change | Files | Draws changed |', '| --- | --- | --- | --- |', ...rows, ''].join('\n');
}

/**
 * Each bundled mob of a pinned release as `mobChanges` reads it, from verified release assets only. The archive
 * cache serves the installed pin; another pin's archives are downloaded and not stored.
 * @param {{ pin: ReleaseAssets, packIds: string[], archiveDirectory: string, fetchImpl: Fetcher }} options
 * @returns {Promise<Map<string, MobBuild>>}
 */
export async function mobBuilds({ pin, packIds, archiveDirectory, fetchImpl }) {
  /** @param {string} name */
  const fetchAsset = (name) => releaseAsset({ pin, name, archiveDirectory, fetchImpl, keep: false });
  const manifest = /** @type {{ models: ManifestModel[] }} */ (JSON.parse((await fetchAsset(MANIFEST)).toString()));
  const mobs = manifest.models.filter((model) => model.kind === 'mob' && packIds.includes(model.pack));
  /** @type {Map<string, MobBuild>} */
  const builds = new Map();
  for (const pack of new Set(mobs.map((mob) => mob.pack))) {
    const inPack = mobs.filter((mob) => mob.pack === pack);
    /** @param {ManifestModel} mob */
    const files = (mob) => [
      ...Object.values(BAKED_FILES).map((field) => mob[field]),
      ...(mob.genome === undefined ? [] : [mob.genome]),
    ];
    const members = inPack.flatMap((mob) => files(mob).map((file) => `${pack}/${file}`));
    // biome-ignore lint/performance/noAwaitInLoops: one pack's archive is unpacked and removed before the next.
    const { directory, unpacked } = extractTarGz(await fetchAsset(`${pack}.tar.gz`), members);
    try {
      for (const mob of inPack) {
        /** @param {string} file */
        const read = (file) => readFileSync(join(unpacked, pack, file));
        builds.set(`${pack}/${mob.id}`, {
          files: /** @type {Record<BakedFile, string>} */ (
            Object.fromEntries(BAKED_FILE_NAMES.map((file) => [file, sha256Hex(read(mob[BAKED_FILES[file]]))]))
          ),
          ...(mob.genome === undefined
            ? {}
            : { genome: /** @type {Genome} */ (JSON.parse(read(mob.genome).toString())) }),
        });
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  return builds;
}

async function main(root = REPOSITORY_ROOT) {
  const { values } = parseArgs({ options: { base: { type: 'string' } } });
  if (values.base === undefined) {
    throw new Error('usage: node tools/skelly-assets/reroll-report.mjs --base <git revision>');
  }
  const basePin = /** @type {ReleaseAssets} */ (
    JSON.parse(execFileSync('git', ['-C', root, 'show', `${values.base}:${PIN_PATH}`], { encoding: 'utf8' }))
  );
  const headPin = /** @type {ReleaseAssets} */ (JSON.parse(readFileSync(join(root, PIN_PATH), 'utf8')));
  /** @param {ReleaseAssets} pin */
  const read = (pin) =>
    mobBuilds({
      pin,
      packIds: bundledPackIds(root, pin),
      archiveDirectory: join(root, ARCHIVES_PATH),
      fetchImpl: fetch,
    });
  const [before, after] = await Promise.all([read(basePin), read(headPin)]);
  process.stdout.write(reportMarkdown(basePin, headPin, mobChanges(before, after)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
