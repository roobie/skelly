// Renders a whole vehicle from its blueprint before any of it joins deadvox content. It exports the blueprint's
// parts through `tools/model-look.mjs`, places each part's model at its fitting and renders the combined model,
// because a part sheet cannot show whether panels meet.
// Usage: node tools/vehicle-look.mjs --blueprint vehicle.libsonnet [--rows rowFile.libsonnet] [--out dir] [--size 512]
// The blueprint file evaluates to `{ blueprint: { id, fittings } }` or to the blueprint itself.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { compileJsonnetFile, REPOSITORY_ROOT } from './jsonnet/index.mjs';

const { values } = parseArgs({
  options: {
    blueprint: { type: 'string' },
    rows: { type: 'string' },
    out: { type: 'string', default: 'vehicle-look' },
    size: { type: 'string', default: '512' },
  },
});
if (!values.blueprint) {
  throw new Error('name the blueprint file with --blueprint');
}

const GLB_MAGIC = 0x46_54_6c_67;
const JSON_CHUNK = 0x4e_4f_53_4a;
const BIN_CHUNK = 0x00_4e_49_42;

function readGlb(path) {
  const file = readFileSync(path);
  if (file.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${path} is not a GLB`);
  }
  let json;
  let bin = Buffer.alloc(0);
  for (let offset = 12; offset < file.length; ) {
    const length = file.readUInt32LE(offset);
    const type = file.readUInt32LE(offset + 4);
    const chunk = file.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) {
      json = JSON.parse(chunk.toString('utf8'));
    } else if (type === BIN_CHUNK) {
      bin = chunk;
    }
    offset += 8 + length;
  }
  return { json, bin };
}

function padded(buffer, fill) {
  const remainder = buffer.length % 4;
  return remainder === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}

function writeGlb(path, json, bin) {
  const jsonChunk = padded(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binChunk = padded(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (length, type) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(length, 0);
    head.writeUInt32LE(type, 4);
    return head;
  };
  writeFileSync(
    path,
    Buffer.concat([
      header,
      chunkHeader(jsonChunk.length, JSON_CHUNK),
      jsonChunk,
      chunkHeader(binChunk.length, BIN_CHUNK),
      binChunk,
    ]),
  );
}

// Appends one model's tables to `merged`, shifting its indices past what is already there, and returns its scene roots.
function appendModel(merged, model, byteStart) {
  const { json: source } = model;
  const base = {
    node: merged.nodes.length,
    mesh: merged.meshes.length,
    material: merged.materials.length,
    accessor: merged.accessors.length,
    view: merged.bufferViews.length,
  };
  merged.bufferViews.push(
    ...(source.bufferViews ?? []).map((view) => ({
      ...view,
      buffer: 0,
      byteOffset: (view.byteOffset ?? 0) + byteStart,
    })),
  );
  merged.accessors.push(
    ...(source.accessors ?? []).map((accessor) => ({ ...accessor, bufferView: accessor.bufferView + base.view })),
  );
  merged.materials.push(...(source.materials ?? []));
  const shiftPrimitive = (primitive) => ({
    ...primitive,
    attributes: Object.fromEntries(
      Object.entries(primitive.attributes).map(([key, value]) => [key, value + base.accessor]),
    ),
    ...(primitive.indices === undefined ? {} : { indices: primitive.indices + base.accessor }),
    ...(primitive.material === undefined ? {} : { material: primitive.material + base.material }),
  });
  merged.meshes.push(
    ...(source.meshes ?? []).map((mesh) => ({ ...mesh, primitives: mesh.primitives.map(shiftPrimitive) })),
  );
  merged.nodes.push(
    ...(source.nodes ?? []).map((node) => ({
      ...node,
      ...(node.mesh === undefined ? {} : { mesh: node.mesh + base.mesh }),
      ...(node.children ? { children: node.children.map((child) => child + base.node) } : {}),
    })),
  );
  return source.scenes[source.scene ?? 0].nodes.map((node) => node + base.node);
}

// One root node per fitting: a mirrored fitting reflects across z about its `at`.
function combine(placed, loadModel) {
  const merged = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
  };
  const extensionsUsed = new Set();
  const chunks = [];
  let byteLength = 0;
  for (const fitting of placed) {
    const model = loadModel(fitting.part);
    if (model.json.images?.length || model.json.textures?.length) {
      throw new Error(`${fitting.part} has textures, which this combiner does not carry`);
    }
    for (const name of model.json.extensionsUsed ?? []) {
      extensionsUsed.add(name);
    }
    const children = appendModel(merged, model, byteLength);
    const chunk = padded(model.bin, 0);
    chunks.push(chunk);
    byteLength += chunk.length;
    merged.nodes.push({
      name: fitting.id,
      translation: fitting.at,
      ...(fitting.mirror ? { scale: [1, 1, -1] } : {}),
      children,
    });
    merged.scenes[0].nodes.push(merged.nodes.length - 1);
  }
  merged.buffers = [{ byteLength }];
  if (extensionsUsed.size > 0) {
    merged.extensionsUsed = [...extensionsUsed];
  }
  return { combined: merged, combinedBin: Buffer.concat(chunks) };
}

const writeAtomic = (path, data) => {
  const scratch = `${path}.${process.pid}.tmp`;
  writeFileSync(scratch, data);
  renameSync(scratch, path);
};
function readPrevious(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

const out = resolve(values.out);
const summaryPath = join(out, 'summary.json');
mkdirSync(out, { recursive: true });
// Any exit before the final summary leaves this mark, so the gallery cannot show the old tiles as current.
writeAtomic(summaryPath, JSON.stringify({ ...readPrevious(summaryPath), state: 'rendering' }));
const evaluated = JSON.parse(compileJsonnetFile(resolve(values.blueprint), REPOSITORY_ROOT));
const blueprint = evaluated.blueprint ?? evaluated;
if (!blueprint.id) {
  throw new Error(`${values.blueprint} has no blueprint id`);
}
// A cargo space is a volume with no model.
const fittings = blueprint.fittings.filter((fitting) => fitting.cargo === undefined);
const partIds = [...new Set(fittings.map((fitting) => fitting.part))];
// A look that stops before writing mass.json must not pass on the previous look's list.
const massPath = join(out, 'parts', 'mass.json');
rmSync(massPath, { force: true });
let partsFailed = false;
try {
  execFileSync(
    process.execPath,
    [
      join(import.meta.dirname, 'model-look.mjs'),
      '--out',
      join(out, 'parts'),
      ...(values.rows
        ? [
            '--rows',
            relative(process.cwd(), resolve(values.rows)),
            '--rows-into',
            'packages/thing-authoring-tool/vehicles/index.libsonnet',
          ]
        : []),
      ...partIds,
    ],
    { stdio: 'inherit' },
  );
} catch {
  partsFailed = true;
}
const exported = existsSync(massPath) ? JSON.parse(readFileSync(massPath, 'utf8')) : {};
const failed = partIds.filter((id) => !(id in exported));
if (failed.length > 0) {
  console.error(`no model for: ${failed.join(' ')} (see the export output above)`);
  process.exit(1);
}
if (partsFailed) {
  console.error(`the part look for ${blueprint.id} failed (see the output above)`);
  process.exit(1);
}
const models = new Map();
const modelOf = (id) => {
  if (!models.has(id)) {
    models.set(id, readGlb(join(out, 'parts', 'glb', `${id}.glb`)));
  }
  return models.get(id);
};
const { combined, combinedBin } = combine(fittings, modelOf);
const modelDir = join(out, 'whole');
mkdirSync(modelDir, { recursive: true });
writeGlb(join(modelDir, `${blueprint.id}.glb`), combined, combinedBin);
// The sheet's views all come from behind, so a half-turned copy shows the nose.
const frontId = `${blueprint.id}_front`;
const turned = structuredClone(combined);
turned.nodes.push({ name: 'half_turn', rotation: [0, 1, 0, 0], children: turned.scenes[0].nodes });
turned.scenes[0].nodes = [turned.nodes.length - 1];
writeGlb(join(modelDir, `${frontId}.glb`), turned, combinedBin);
// A failed sheet leaves the previous render's tiles in place, so it must not read as a success.
try {
  execFileSync(
    process.execPath,
    [
      join(import.meta.dirname, 'model-sheet.mjs'),
      '--models',
      modelDir,
      '--out',
      join(out, 'sheet'),
      '--size',
      values.size,
      blueprint.id,
      frontId,
    ],
    { stdio: 'inherit' },
  );
} catch {
  console.error(`no new render of ${blueprint.id} (see the sheet output above)`);
  process.exit(1);
}
// `tools/vehicle-gallery.mjs` reads this beside the sheet.
const mass = JSON.parse(readFileSync(join(out, 'parts', 'mass.json'), 'utf8'));
writeAtomic(
  summaryPath,
  JSON.stringify({
    state: 'ok',
    id: blueprint.id,
    name: blueprint.name ?? blueprint.id,
    fittings: fittings.length,
    parts: partIds.length,
    sharedParts: partIds.filter((id) => !id.startsWith(`${blueprint.id}_`)).length,
    massKg: fittings.reduce((sum, fitting) => sum + (mass[fitting.part] ?? 0), 0),
  }),
);
console.log(`whole vehicle: ${join(out, 'sheet', 'tiles')}/{${blueprint.id},${frontId}}.png`);
