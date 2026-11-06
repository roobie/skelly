// One step from an edited thing row to a picture and its numbers, for batch authors. It exports only the
// named rows into a scratch folder, never into deadvox content, so it is fast and parallel worktrees stay
// apart; then it renders them and checks size and mass against the reference catalogue.
// Usage: node tools/model-look.mjs [--rows rowFile.libsonnet] [--rows-into index.libsonnet] [--out dir] [--ref catalogue-or-batch.json] <rowId | rowId=cddaId> ...
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { compileJsonnetSources } from './jsonnet/compile.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'model-look' },
    rows: { type: 'string' },
    'rows-into': { type: 'string', default: 'packages/thing-authoring-tool/catalogue/index.libsonnet' },
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

// Compiled output goes to scratch and the recipe's JSON imports are pointed there: a batch branch must not
// carry regenerated outputs, which only stay consistent after the full export that landing runs.
const compiled = join(out, 'compiled');
const root = resolve(import.meta.dirname, '..');
// A catalogue batch joins the build only when it lands; --rows looks at one before that through an
// overlaid index that adds it. The index decides the row's export class, so a vehicle part names the vehicle index.
let overlay;
if (values.rows) {
  const index = values['rows-into'];
  const rows = relative(root, resolve(values.rows));
  const indexText = readFileSync(join(root, index), 'utf8').trimEnd();
  if (indexText.includes(`'${rows}'`)) {
    console.log(`${rows} is already indexed`);
  } else {
    overlay = join(out, 'overlay');
    mkdirSync(join(overlay, dirname(index)), { recursive: true });
    writeFileSync(join(overlay, index), `${indexText}\n+ (import '${rows}')\n`);
  }
}
compileJsonnetSources({
  within: [
    'packages/thing-core/src',
    'packages/thing-authoring-tool',
    'packages/deadvox/src/content/base/presentation',
  ],
  outDir: compiled,
  overlay,
});
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (!(result.url.startsWith('file:') && result.url.endsWith('.json'))) {
      return result;
    }
    const scratch = join(compiled, relative(root, fileURLToPath(result.url)));
    return existsSync(scratch) ? { ...result, url: pathToFileURL(scratch).href } : result;
  },
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
  // A failed row must leave no model, or the sheet would draw its old geometry as new.
  rmSync(join(glbDir, `${id}.glb`), { force: true });
  try {
    const { glb, physical } = generate();
    writeFileSync(join(glbDir, `${id}.glb`), glb);
    mass[id] = physical.massKg;
  } catch (error) {
    rmSync(join(out, 'tiles', `${id}.png`), { force: true });
    console.log(`EXPORT FAILED ${id}: ${error.message}`);
  }
}
writeFileSync(join(out, 'mass.json'), JSON.stringify(mass));
if (Object.keys(mass).length === 0) {
  process.exit(1);
}
// The sheet keeps every row looked at into this folder, so re-looking at a few rows still shows the whole
// batch; a model whose row is gone is dropped.
const recipeIds = new Set(recipe.map(({ id }) => id));
const shown = [];
for (const file of readdirSync(glbDir)) {
  const id = file.replace(/\.glb$/, '');
  if (recipeIds.has(id)) {
    shown.push(id);
  } else {
    unlinkSync(join(glbDir, file));
    rmSync(join(out, 'tiles', `${id}.png`), { force: true });
  }
}
// The sheet also redraws rows from earlier looks, so only a row asked for here decides this look's exit code below.
const sheetPath = join(out, 'sheet.json');
rmSync(sheetPath, { force: true });
try {
  execFileSync(
    process.execPath,
    [join(import.meta.dirname, 'model-sheet.mjs'), '--models', glbDir, '--out', out, '--size', values.size, ...shown],
    { stdio: 'inherit' },
  );
} catch {
  // The sheet has already named what failed.
}

// ---------- numbers against the reference ----------
const sheet = new Map((existsSync(sheetPath) ? JSON.parse(readFileSync(sheetPath, 'utf8')) : []).map((r) => [r.id, r]));
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
if (ids.some((id) => mass[id] === undefined || !sheet.get(id) || sheet.get(id).error)) {
  process.exitCode = 1;
}
