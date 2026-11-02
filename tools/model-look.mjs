// One step from an edited thing row to a picture and its numbers, for batch authors. It exports only the
// named rows into a scratch folder, never into deadvox content, so it is fast and parallel worktrees stay
// apart; then it renders them and checks size and mass against the reference catalogue.
// Usage: node tools/model-look.mjs [--out dir] [--ref catalogue-or-batch.json] <rowId | rowId=cddaId> ...
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { compileJsonnetSources } from './jsonnet/compile.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'model-look' },
    ref: { type: 'string' },
    size: { type: 'string', default: '256' },
  },
});
if (positionals.length === 0) {
  throw new Error('name the thing rows to look at');
}
const pairs = positionals.map((p) => p.split('='));
const ids = pairs.map(([id]) => id);
const out = resolve(values.out);
const glbDir = join(out, 'glb');
mkdirSync(glbDir, { recursive: true });

compileJsonnetSources({
  within: [
    'packages/thing-core/src',
    'packages/thing-authoring-tool',
    'packages/deadvox/src/content/base/presentation',
  ],
});
let recipe;
try {
  const { loadThingRecipe } = await import('../packages/thing-authoring-tool/src/exports.ts');
  recipe = loadThingRecipe();
} catch (error) {
  // Schema errors arrive as a long issue dump; one line per issue with its path is what an author needs.
  if (!error.issues) {
    throw error;
  }
  for (const issue of error.issues) {
    console.log(
      `ROW ERROR ${(issue.path ?? []).map((p) => p.key).join('.')}: ${issue.message} (${JSON.stringify(issue.input)})`,
    );
  }
  process.exit(1);
}
const rows = recipe.filter(({ id }) => ids.includes(id));
const missing = ids.filter((id) => !rows.some((r) => r.id === id));
if (missing.length > 0) {
  console.log(`not in the recipe (missing import in items.jsonnet?): ${missing.join(' ')}`);
}
const mass = {};
for (const { id, generate } of rows) {
  try {
    const { glb, physical } = generate();
    writeFileSync(join(glbDir, `${id}.glb`), glb);
    mass[id] = physical.massKg;
  } catch (error) {
    console.log(`EXPORT FAILED ${id}: ${error.message}`);
  }
}
const exported = Object.keys(mass);
if (exported.length === 0) {
  process.exit(1);
}
execFileSync(
  process.execPath,
  [join(import.meta.dirname, 'model-sheet.mjs'), '--models', glbDir, '--out', out, '--size', values.size, ...exported],
  { stdio: 'inherit' },
);

// ---------- numbers against the reference ----------
const sheet = new Map(JSON.parse(readFileSync(join(out, 'sheet.json'), 'utf8')).map((r) => [r.id, r]));
const reference = values.ref ? JSON.parse(readFileSync(resolve(values.ref), 'utf8')) : [];
const refById = new Map(
  reference.flatMap((r) => [[r.cdda, r], ...(r.variants ?? []).map((v) => [v.cdda, { ...r, ...v }])]),
);
const ratio = (a, b) => (b > 0 ? a / b : undefined);
const off = (x, lo, hi) => x !== undefined && (x < lo || x > hi);
const fmt = (x) => (x === undefined ? '-' : x.toFixed(2));
const lines = [];
for (const [id, cdda = id] of pairs) {
  const s = sheet.get(id);
  if (!s || s.error) {
    continue;
  }
  const boxMl = s.sizeCm.reduce((a, b) => a * b, 1);
  const longestMm = Math.max(...s.sizeCm) * 10;
  let line = `${id.padEnd(28)} ${s.sizeCm.join(' x ')} cm  ${mass[id].toFixed(3)} kg  ${s.triangles} tris`;
  const ref = refById.get(cdda);
  if (ref) {
    const m = ratio(mass[id] * 1000, ref.weightG);
    const v = ratio(boxMl, ref.volumeMl);
    const l = ref.longestSideMm ? ratio(longestMm, ref.longestSideMm) : undefined;
    const flags = [];
    // CDDA volume is a carried volume, close to a loose bounding box; a wide band leaves room for judgement.
    if (!ref.unitsPerStack && off(m, 0.67, 1.5)) {
      flags.push('MASS');
    }
    if (!ref.unitsPerStack && off(v, 0.3, 4)) {
      flags.push('VOLUME');
    }
    if (off(l, 0.7, 1.4)) {
      flags.push('LENGTH');
    }
    line += `\n    vs ${ref.cdda}: mass x${fmt(m)}, box/volume x${fmt(v)}, longest x${fmt(l)}${ref.unitsPerStack ? ' (reference is per unit)' : ''}${flags.length > 0 ? `  CHECK ${flags.join(' ')}` : ''}`;
  } else if (values.ref) {
    line += '\n    no reference row; pair it as rowId=cddaId';
  }
  lines.push(line);
}
console.log(`\n${lines.join('\n')}\n\ntiles: ${join(out, 'tiles')}/<id>.png  sheet: ${join(out, 'index.html')}`);
