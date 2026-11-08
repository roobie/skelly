// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared contract assertions run inside the caller's Node test.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namedNodes } from '../packages/deadvox/src/render/firearmModel.ts';
import { packFileBytes, packFileOrigin, readAvailablePacks } from '../packages/deadvox/tools/readBundledPacks.ts';

export const PACKAGE_ROOT = fileURLToPath(new URL('../packages/deadvox/', import.meta.url));
const BUILT = fileURLToPath(new URL('../packages/skelly-assets/built/', import.meta.url));
/** The pinned producer manifest: every model the submodule builds and every file under each pack namespace. */
const PINNED = JSON.parse(readFileSync(resolve(BUILT, 'manifest.json'), 'utf8'));

export const glbJson = (bytes) =>
  JSON.parse(
    bytes
      .subarray(20, 20 + bytes.readUInt32LE(12))
      .toString()
      .trim(),
  );
const namespaceFiles = (id) =>
  readdirSync(resolve(BUILT, id), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(resolve(BUILT, id), resolve(entry.parentPath, entry.name)).split(sep).join('/'));
const pinnedPaths = (id) => new Set(PINNED.packs[id]?.files ?? []);
// Content files resolve a model's file within their own pack.
const contentModels = (pack) =>
  pack.manifest.files
    .filter(({ kind }) => kind === 'content')
    .flatMap(({ path }) => pack.files.find(({ source }) => source === path).data.models ?? []);
/** Each content model of a pack that draws a file its pack pins, beside that pinned row. */
const producedUses = (pack) => {
  const byPath = new Map(PINNED.models.filter((row) => row.pack === pack.manifest.id).map((row) => [row.path, row]));
  return contentModels(pack)
    .filter((model) => byPath.has(model.file))
    .map((model) => ({ model, row: byPath.get(model.file) }));
};

/** A model drawing an external file that no pinned row names would otherwise drop out of both sides of the check. */
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

/** The external orphan check: a bundled namespace holds only what its pack declares and the manifest pins. */
const orphanIssues = (pack) => {
  const { id } = pack.manifest;
  if (PINNED.packs[id] === undefined) {
    return [];
  }
  const declared = new Set(pack.manifest.files.map(({ path }) => path));
  return namespaceFiles(id).flatMap((path) => [
    ...(declared.has(path) ? [] : [`${id}: external ${path} is not declared`]),
    ...(pinnedPaths(id).has(path) ? [] : [`${id}: external ${path} is not pinned`]),
  ]);
};

/** One bundled pack's rows of one kind: both sides of the pinned-to-consumed comparison and the origins it reads. */
const packKind = (pack, kind, dir) => {
  const { id } = pack.manifest;
  const entryOf = (row) => `${dir}/${row.id}.model.json`;
  const pinned = PINNED.models.filter((row) => row.pack === id && row.kind === kind);
  const consumed = producedUses(pack).filter(({ row }) => row.kind === kind);
  const issues = consumed.length === 0 ? [`${id} ${kind}: pending, pinned rows and none consumed`] : [];
  for (const row of pinned) {
    if (!consumed.some((use) => use.row === row)) {
      issues.push(`${id} ${kind}: pinned ${row.id} is not consumed`);
    }
    if (!pinnedPaths(id).has(entryOf(row))) {
      issues.push(`${id} ${kind}: pinned ${row.id} has no ${entryOf(row)}`);
    }
  }
  for (const { model, row } of consumed.filter((use) => use.model.id !== use.row.id)) {
    issues.push(`${id} ${kind}: model ${model.id} draws the pinned file of ${row.id}`);
  }
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
 * kinds are those of the pinned rows that have an entry there. Per kind, every bundled pack with pinned rows of that
 * kind must consume exactly those rows from the external root; a pack that pins rows and consumes none is pending,
 * which is an issue, never a skip. Namespaces no bundled pack owns belong to another product and are only listed.
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
  const applicable = packKinds
    .filter(({ id }) => bundled.has(id))
    .map(({ id, kind }) => packKind(bundled.get(id), kind, dir));
  return {
    kinds,
    issues: [
      ...applicable.flatMap(({ issues }) => issues),
      ...[...bundled.values()].flatMap((pack) => [...unpinnedIssues(pack), ...orphanIssues(pack)]),
    ],
    listing: applicable.map(({ listing }) => listing),
    notApplicable: [...new Set(packKinds.filter(({ id }) => !bundled.has(id)).map(({ id }) => id))],
    rows: applicable.flatMap(({ rows }) => rows),
  };
};

/** A clean cut-over that consumes a row of every kind, listing each pack's consumed rows and the packs it skips. */
export const assertCutOver = ({ kinds, issues, listing, notApplicable, rows }, context) => {
  context.diagnostic(`consumed: ${listing.join('; ')}`);
  context.diagnostic(`not applicable, no bundled pack: ${notApplicable.join(', ') || 'none'}`);
  assert.deepEqual(issues, []);
  assert.ok(kinds.length > 0, 'no pinned row has an entry of this producer');
  for (const kind of kinds) {
    assert.ok(
      rows.some((use) => use.kind === kind),
      `${kind}: no consumed row`,
    );
  }
};

/** The pinned bytes and entry of a consumed row, read through the pack reader. */
export const pinnedFiles = ({ pack, row, entry }) => ({
  glb: packFileBytes(PACKAGE_ROOT, pack, row.path),
  modelEntry: JSON.parse(packFileBytes(PACKAGE_ROOT, pack, entry).toString('utf8')),
});

/**
 * Compares one consumed row with its pinned manifest row: the entry names the row's id and logical path, the GLB's
 * part nodes are the row's nodes and resolve through the Deadvox loader, and the pack credits the file as the row does.
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
  const assets = JSON.parse(packFileBytes(PACKAGE_ROOT, pack, 'assets/manifest.json').toString('utf8'));
  const credits = assets.sources.filter(({ files }) => files.includes(row.path));
  assert.ok(credits.length > 0, `${at}: missing asset credit`);
  for (const { author, licence } of credits) {
    assert.deepEqual({ author, licence }, row.credits, `${at}: credit differs from the pinned row`);
  }
};

/**
 * Every mesh is voxelised, and one model's grains nest so its lattices align. Which voxel class a model takes is the
 * producer's recipe choice and is not in the pinned output.
 */
export const assertVoxelized = ({ id, glb }) => {
  const primitives = glbJson(Buffer.from(glb)).meshes.flatMap((mesh) => mesh.primitives);
  assert.ok(primitives.length > 0, `${id}: no meshes`);
  const grains = primitives.map(({ extras }) => extras?.voxelGrain);
  for (const grain of grains) {
    assert.ok(Number.isFinite(grain) && grain > 0, `${id}: a mesh is not voxelized`);
  }
  const finest = Math.min(...grains);
  for (const grain of grains) {
    const ratio = grain / finest;
    assert.ok(Math.abs(ratio - Math.round(ratio)) < 1e-9, `${id}: grain ${grain} does not nest on ${finest}`);
  }
};
