// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared contract assertions run inside the caller's Node test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namedNodes } from '@skelly/presentation/render';
import { packFileBytes, packFileOrigin, readAvailablePacks } from '../packages/deadvox/tools/readBundledPacks.ts';

/**
 * @typedef {import('@skelly/engine/packs').PackInput} PackInput
 * @typedef {import('@skelly/engine/content').ModelDef} ModelDef
 * @typedef {{ author: string | null, licence: string }} PinnedCredit
 * @typedef {{ id: string, kind: string, pack: string, path: string, nodes?: string[], credits: PinnedCredit }} PinnedModel
 * @typedef {{ packs: Record<string, { files: string[] } | undefined>, models: PinnedModel[] }} PinnedManifest
 * @typedef {{ pack: PackInput, kind: string, row: PinnedModel, entry: string }} ConsumedRow
 */
/**
 * The glTF JSON fields these checks read.
 * @typedef {object} GltfJson
 * @property {{ name?: string, mesh?: number }[]} nodes
 * @property {{ primitives: { extras?: { voxelGrain?: number } }[] }[]} meshes
 * @property {{ pbrMetallicRoughness: { baseColorFactor: number[] } }[]} materials
 */

export const PACKAGE_ROOT = fileURLToPath(new URL('../packages/deadvox/', import.meta.url));
const BUILT = fileURLToPath(new URL('../packages/skelly-assets/built/', import.meta.url));
/**
 * The pinned producer manifest: every model the submodule builds and every file under each pack namespace.
 * @type {PinnedManifest}
 */
const PINNED = JSON.parse(readFileSync(resolve(BUILT, 'manifest.json'), 'utf8'));

/**
 * @param {Buffer} bytes
 * @returns {GltfJson}
 */
export const glbJson = (bytes) =>
  JSON.parse(
    bytes
      .subarray(20, 20 + bytes.readUInt32LE(12))
      .toString()
      .trim(),
  );
/** @param {string} id */
const pinnedPaths = (id) => new Set(PINNED.packs[id]?.files ?? []);
/**
 * Content files resolve a model's file within their own pack.
 * @param {PackInput} pack
 * @returns {ModelDef[]}
 */
const contentModels = (pack) =>
  pack.manifest.files
    .filter(({ kind }) => kind === 'content')
    .flatMap(({ path }) => {
      const content = pack.files.find(({ source }) => source === path);
      if (!content) {
        throw new Error(`${pack.manifest.id}: no content file ${path}`);
      }
      return /** @type {import('@skelly/engine/content').ContentFile} */ (content.data).models ?? [];
    });
/**
 * Each content model of a pack that draws a file its pack pins, beside that pinned row.
 * @param {PackInput} pack
 */
const producedUses = (pack) => {
  const byPath = new Map(PINNED.models.filter((row) => row.pack === pack.manifest.id).map((row) => [row.path, row]));
  return contentModels(pack).flatMap((model) => {
    const row = byPath.get(model.file);
    return row ? [{ model, row }] : [];
  });
};

/**
 * A model drawing an external file that no pinned row names would otherwise drop out of both sides of the check.
 * @param {PackInput} pack
 */
const unpinnedIssues = (pack) => {
  const { id } = pack.manifest;
  const named = new Set(PINNED.models.filter((row) => row.pack === id).map((row) => row.path));
  const declared = new Set(pack.manifest.files.map(({ path }) => path));
  return contentModels(pack)
    .filter(
      ({ file }) => declared.has(file) && !named.has(file) && packFileOrigin(PACKAGE_ROOT, pack, file) === 'external',
    )
    .map((model) => `${id}: model ${model.id} draws external ${model.file}, which no pinned row names`);
};

/**
 * One bundled pack's rows of one kind: both sides of the pinned-to-consumed comparison and the origins it reads.
 * @param {PackInput} pack
 * @param {string} kind
 * @param {string} dir
 */
const packKind = (pack, kind, dir) => {
  const { id } = pack.manifest;
  /** @param {PinnedModel} row */
  const entryOf = (row) => `${dir}/${row.id}.model.json`;
  const pinned = PINNED.models.filter((row) => row.pack === id && row.kind === kind);
  const consumed = producedUses(pack).filter(({ row }) => row.kind === kind);
  /** @type {string[]} */
  const issues = [];
  for (const row of pinned) {
    if (!pinnedPaths(id).has(entryOf(row))) {
      issues.push(`${id} ${kind}: pinned ${row.id} has no ${entryOf(row)}`);
    }
  }
  for (const { model, row } of consumed.filter((use) => use.model.id !== use.row.id)) {
    issues.push(`${id} ${kind}: model ${model.id} draws the pinned file of ${row.id}`);
  }
  /** @type {ConsumedRow[]} */
  const rows = [...new Set(consumed.filter((use) => use.model.id === use.row.id).map(({ row }) => row))].map((row) => ({
    pack,
    kind,
    row,
    entry: entryOf(row),
  }));
  const resolved = rows
    .flatMap(({ row, entry }) => [row.path, entry])
    .map((path) => ({ path, origin: packFileOrigin(PACKAGE_ROOT, pack, path) }));
  for (const { path, origin } of resolved.filter((file) => file.origin !== 'external')) {
    issues.push(`${id} ${kind}: ${path} resolves ${origin}`);
  }
  const origins = Object.groupBy(resolved, ({ origin }) => origin);
  const counts = Object.entries(origins).map(([origin, files]) => `${files.length} ${origin}`);
  return { issues, rows, listing: `${id} ${kind}: ${rows.length} rows, files ${counts.join(', ')}` };
};

/**
 * The cut-over state of one producer's models: `dir` is where it writes model entries in a pack namespace, and its
 * kinds are those of the pinned rows that have an entry there. Per kind, every row a bundled pack consumes must be one
 * of its pinned rows and come from the external root; a pinned row may stay unconsumed, because the producer carries
 * models Deadvox does not use. Namespaces no bundled pack owns belong to another product and are only listed.
 * @param {string} dir
 */
export const readCutOver = (dir) => {
  const bundled = new Map(readAvailablePacks(PACKAGE_ROOT).map((pack) => [pack.manifest.id, pack]));
  const kinds = [
    ...new Set(
      PINNED.models
        .filter((row) => bundled.has(row.pack) && pinnedPaths(row.pack).has(`${dir}/${row.id}.model.json`))
        .map(({ kind }) => kind),
    ),
  ].sort();
  const packKinds = kinds.flatMap((kind) =>
    [...new Set(PINNED.models.filter((row) => row.kind === kind).map((row) => row.pack))]
      .sort()
      .map((id) => ({ id, kind })),
  );
  const applicable = packKinds.flatMap(({ id, kind }) => {
    const pack = bundled.get(id);
    return pack ? [packKind(pack, kind, dir)] : [];
  });
  return {
    kinds,
    issues: [...applicable.flatMap(({ issues }) => issues), ...[...bundled.values()].flatMap(unpinnedIssues)],
    listing: applicable.map(({ listing }) => listing),
    notApplicable: [...new Set(packKinds.filter(({ id }) => !bundled.has(id)).map(({ id }) => id))],
    rows: applicable.flatMap(({ rows }) => rows),
  };
};

/**
 * A clean cut-over, listing each pack's consumed rows and the packs it skips. At least one consumed row keeps the
 * row-matching checks that read `rows` from passing vacuously.
 * @param {ReturnType<typeof readCutOver>} cutOver
 * @param {import('node:test').TestContext} context
 */
export const assertCutOver = ({ kinds, issues, listing, notApplicable, rows }, context) => {
  context.diagnostic(`consumed: ${listing.join('; ')}`);
  context.diagnostic(`not applicable, no bundled pack: ${notApplicable.join(', ') || 'none'}`);
  assert.deepEqual(issues, []);
  assert.ok(kinds.length > 0, 'no pinned row has an entry of this producer');
  assert.ok(rows.length > 0, 'no pinned row is consumed');
};

/**
 * The pinned bytes and entry of a consumed row, read through the pack reader. The entry is the producer's model
 * entry, which the contract tests validate against the model schema.
 * @param {ConsumedRow} consumed
 */
export const pinnedFiles = ({ pack, row, entry }) => ({
  glb: packFileBytes(PACKAGE_ROOT, pack, row.path),
  modelEntry: /** @type {ModelDef} */ (JSON.parse(packFileBytes(PACKAGE_ROOT, pack, entry).toString('utf8'))),
});

/**
 * Compares one consumed row with its pinned manifest row: the entry names the row's id and logical path, the GLB's
 * part nodes are the row's nodes and resolve through the Deadvox loader, and the pack credits the file as the row does.
 * @param {ConsumedRow & ReturnType<typeof pinnedFiles> & { loaded: import('three/addons/loaders/GLTFLoader.js').GLTF }} pinned
 */
export const assertPinnedRow = ({ pack, row, glb, modelEntry, loaded }) => {
  const at = `${pack.manifest.id} ${row.id}`;
  assert.equal(modelEntry.id, row.id, `${at}: entry names another model`);
  assert.equal(modelEntry.file, row.path, `${at}: entry draws another file`);
  const meshNodes = glbJson(Buffer.from(glb))
    .nodes.filter((node) => node.mesh !== undefined)
    .map(({ name }) => name);
  assert.deepEqual(
    [...meshNodes].sort(),
    [...(row.nodes ?? [])].sort(),
    `${at}: part nodes differ from the pinned row`,
  );
  assert.equal(namedNodes(loaded.scene, loaded.parser, row.nodes ?? []).length, meshNodes.length);
  /** @type {import('@skelly/engine/content').Manifest} */
  const assets = JSON.parse(packFileBytes(PACKAGE_ROOT, pack, 'assets/manifest.json').toString('utf8'));
  const credits = assets.sources.filter(({ files }) => files.includes(row.path));
  assert.ok(credits.length > 0, `${at}: missing asset credit`);
  for (const { author, licence } of credits) {
    assert.deepEqual({ author, licence }, row.credits, `${at}: credit differs from the pinned row`);
  }
};

/**
 * Every mesh is voxelised on its recipe row's class. The pinned output does not carry the class, so `voxel` comes from
 * the producer's recipe at the same pin.
 * @param {{ id: string, glb: Buffer, voxel: { grain?: number, detailGrain?: number } | undefined }} voxelized
 */
export const assertVoxelized = ({ id, glb, voxel }) => {
  assert.ok(voxel, `${id}: no recipe row`);
  const grains = [voxel.grain, voxel.detailGrain].filter((grain) => grain !== undefined);
  const primitives = glbJson(Buffer.from(glb)).meshes.flatMap((mesh) => mesh.primitives);
  assert.ok(primitives.length > 0, `${id}: no meshes`);
  for (const { extras } of primitives) {
    const grain = extras?.voxelGrain;
    assert.ok(grain !== undefined && grains.includes(grain), `${id}: a mesh is not voxelized on the row's class`);
  }
};
