// Builds a reference catalogue of candidate items from a CDDA checkout, so batch authors know which
// everyday things exist and their size, weight and materials. CDDA is CC BY-SA 3.0, so the output is a
// scratch reference only and is never committed: authors write their own geometry and text.
// Usage: node tools/cdda-reference.mjs --cdda <checkout>/data/json --out <dir> [--at <commit>] [--batch 15] [--wave first]
// tools/catalogue-batch.mjs runs it with a pinned release and commit; run it by hand only to explore.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    cdda: { type: 'string' },
    out: { type: 'string', default: 'cdda-reference' },
    at: { type: 'string' },
    batch: { type: 'string', default: '15' },
    wave: { type: 'string', default: 'first' },
  },
});
if (!values.cdda) {
  throw new Error('--cdda <checkout>/data/json is required');
}
const root = resolve(values.cdda);
const repo = resolve(import.meta.dirname, '..');
const BATCH = Number(values.batch);

// ---------- load and resolve copy-from ----------
const JSON_FILE = /\.json$/;
const WEIGHT = /^\s*([\d.]+)\s*(mg|g|kg)\s*$/i;
const VOLUME = /^\s*([\d.]+)\s*(ml|l)\s*$/i;
const LENGTH = /^\s*([\d.]+)\s*(mm|cm|m|km)\s*$/i;
const DEBUG = /debug/i;
const NON_WORD = /[^a-z0-9]+/g;
const ITEM_FILE = /^items-.*\.json$/;
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      return walk(p);
    }
    return JSON_FILE.test(p) ? [p] : [];
  });
const defs = new Map();
for (const file of walk(join(root, 'items'))) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  for (const o of Array.isArray(data) ? data : [data]) {
    if (o?.type !== 'ITEM') {
      continue;
    }
    const id = o.id ?? o.abstract;
    if (typeof id !== 'string') {
      continue;
    }
    defs.set(id, { ...o, sourceFile: relative(join(root, 'items'), file).replace(JSON_FILE, '') });
  }
}
const grams = (v) => {
  if (typeof v === 'number') {
    return v;
  }
  const m = WEIGHT.exec(String(v ?? ''));
  return m ? Number(m[1]) * { mg: 0.001, g: 1, kg: 1000 }[m[2].toLowerCase()] : undefined;
};
const millilitres = (v) => {
  if (typeof v === 'number') {
    return v * 250;
  }
  const m = VOLUME.exec(String(v ?? ''));
  return m ? Number(m[1]) * (m[2].toLowerCase() === 'l' ? 1000 : 1) : undefined;
};
const millimetres = (v) => {
  const m = LENGTH.exec(String(v ?? ''));
  return m ? Number(m[1]) * { mm: 1, cm: 10, m: 1000, km: 1e6 }[m[2].toLowerCase()] : undefined;
};
// copy-from may scale (proportional) or offset (relative) the parent's weight and volume.
const MEASURES = {
  weight: { read: grams, write: (g) => g },
  volume: { read: millilitres, write: (ml) => `${ml} ml` },
};
function adjustBy(item, changes, combine) {
  for (const [key, change] of Object.entries(changes ?? {})) {
    const measure = MEASURES[key];
    const parent = measure?.read(item[key]);
    if (parent !== undefined) {
      item[key] = measure.write(combine(parent, change, measure.read));
    }
  }
}
function adjust(item, own) {
  adjustBy(item, own.proportional, (parent, scale) => parent * scale);
  adjustBy(item, own.relative, (parent, delta, read) => parent + (read(delta) ?? 0));
}
const resolved = new Map();
function resolveDef(id, seen = new Set()) {
  if (resolved.has(id)) {
    return resolved.get(id);
  }
  const own = defs.get(id);
  if (!own || seen.has(id)) {
    return;
  }
  seen.add(id);
  const parent = own['copy-from'] ? (resolveDef(own['copy-from'], seen) ?? {}) : {};
  const out = { ...parent, ...own };
  out.abstract = undefined;
  adjust(out, own);
  if (own.extend?.qualities) {
    out.qualities = [...(parent.qualities ?? []), ...own.extend.qualities];
  }
  if (own.extend?.flags) {
    out.flags = [parent.flags ?? [], own.extend.flags].flat();
  }
  resolved.set(id, out);
  return out;
}

// ---------- normalise ----------
const nameOf = (n) => (typeof n === 'string' ? n : (n?.str ?? n?.str_sp ?? ''));
const materialsOf = (m) =>
  m === undefined ? [] : (Array.isArray(m) ? m : [m]).map((x) => (typeof x === 'string' ? x : x.type));
const subtypesOf = (o) => o.subtypes ?? [];
function categoryOf(o) {
  if (o.category) {
    return o.category;
  }
  const s = subtypesOf(o);
  if (s.includes('COMESTIBLE')) {
    return o.comestible_type === 'MED' ? 'drugs' : 'food';
  }
  if (s.includes('TOOL')) {
    return 'tools';
  }
  return 'other';
}

// ---------- first wave: rigid everyday things that fit a modern zombie survival setting ----------
// Clothing waits for skinning; guns are authored in the gun tool; the rest falls outside the setting.
const EXCLUDED_SUBTYPES = [
  'ARMOR',
  'GUN',
  'GUNMOD',
  'AMMO',
  'MAGAZINE',
  'BIONIC_ITEM',
  'BOOK',
  'PET_ARMOR',
  'ARTIFACT',
  'ENGINE',
  'WHEEL',
  'TOOLMOD',
  'SEED',
];
const EXCLUDED_CATEGORIES = [
  'armor',
  'clothing',
  'weapons',
  'guns',
  'ammo',
  'manuals',
  'ma_manuals',
  'books',
  'bionics',
  'artifacts',
  'mutagen',
  'corpses',
  'currency',
  'software',
  'e_files',
  'maps',
  'veh_parts',
  'keys',
  'seeds',
];
const EXCLUDED_FILES =
  /^(nether|netherum|relics|bionics|mutagen_ingredients|corpses|fake|software|robot_parts|id_cards|biosignatures|items_holiday|classes|basecamp|newspaper|fluff|gun|gunmod|ammo|magazine|armor|book|ranged|vehicle|melee)(\/|$)/;
const OFF_SETTING =
  /\b(atomic|plutonium|nether|mi-go|bionic|cbm|nanobot|nano|fusion|plasma|laser|mutagen|serum|artifact|alien|portal|exodii|cyber|robot|drone|power armor|antimatter|tachyon|psionic|psychic|eldritch|resonance|matrix|cyborg|zombie|zed|monster|mutant|triffid|fungal|chitin|acidic)\b/i;
// A wave names the source groups it draws from, so each wave's scope reads at a glance.
const WAVES = {
  first:
    /^(tool\/(?!debug_tools|explosives|handloading)|generic(\/(bathroom_house|bedding|dining_kitchen|mail|music|spares|storage|string|toys_and_sports))?$|containers\/(containers|generic|lab|military)$|comestibles\/med$|appliances|electronics$|furniture\/|resources\/(?!alien|bone)|toy$)/,
};
const wave = WAVES[values.wave];
if (!wave) {
  throw new Error(`--wave must be one of ${Object.keys(WAVES).join(', ')}`);
}
const keep = (o) => {
  if (o.id === undefined || o.abstract) {
    return false;
  }
  if (!wave.test(o.sourceFile)) {
    return false;
  }
  if (subtypesOf(o).some((s) => EXCLUDED_SUBTYPES.includes(s))) {
    return false;
  }
  if (EXCLUDED_CATEGORIES.includes(categoryOf(o))) {
    return false;
  }
  if (EXCLUDED_FILES.test(o.sourceFile)) {
    return false;
  }
  if (OFF_SETTING.test(`${o.id} ${nameOf(o.name)}`) || DEBUG.test(o.id)) {
    return false;
  }
  if ([o.flags ?? []].flat().some((f) => ['PSEUDO', 'NO_DROP', 'ZERO_WEIGHT', 'TRADER_AVOID'].includes(f))) {
    return false;
  }
  return grams(o.weight) !== undefined && millilitres(o.volume) !== undefined;
};

// ---------- what we already have ----------
// Read at a fixed commit when given: landed batches add items, and a catalogue rebuilt from the working tree
// would drop them and renumber every later batch.
const git = (args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const readRepo = (path) => (values.at ? git(['show', `${values.at}:${path}`]) : readFileSync(join(repo, path), 'utf8'));
const listRepo = (dir) =>
  values.at ? git(['ls-tree', '--name-only', `${values.at}:${dir}`]).split('\n') : readdirSync(join(repo, dir));
const norm = (s) => s.toLowerCase().replace(NON_WORD, ' ').trim();
const existing = new Set();
for (const row of JSON.parse(readRepo('packages/thing-authoring-tool/items.json')).items) {
  existing.add(norm(row.id));
}
const contentDir = 'packages/deadvox/src/content/base';
for (const f of listRepo(contentDir).filter((name) => ITEM_FILE.test(name))) {
  const data = JSON.parse(readRepo(`${contentDir}/${f}`));
  for (const item of Array.isArray(data) ? data : (data.items ?? [])) {
    existing.add(norm(item.id));
    if (item.name) {
      existing.add(norm(typeof item.name === 'string' ? item.name : (item.name.singular ?? '')));
    }
  }
}

// ---------- build ----------
const rows = [];
const skippedExisting = [];
for (const id of defs.keys()) {
  const o = resolveDef(id);
  if (!(o && keep(o))) {
    continue;
  }
  const name = nameOf(o.name);
  if (existing.has(norm(id)) || existing.has(norm(name))) {
    skippedExisting.push(id);
    continue;
  }
  rows.push({
    cdda: id,
    name,
    group: o.sourceFile,
    category: categoryOf(o),
    subtypes: subtypesOf(o),
    weightG: Math.round(grams(o.weight) * 10) / 10,
    volumeMl: Math.round(millilitres(o.volume)),
    longestSideMm: millimetres(o.longest_side),
    materials: materialsOf(o.material),
    qualities: (o.qualities ?? []).map(([q, level]) => `${q}:${level}`),
    // Weight and volume are per unit when set: the model is then the package or a single unit, by judgement.
    unitsPerStack: o.count ?? o.charges ?? o.initial_charges,
    phase: o.phase,
    looksLike: o.looks_like,
    copyFrom: o['copy-from'],
    // Reference for the shape only; never copy it into Deadvox text.
    lookHint: o.description ? nameOf(o.description) : undefined,
  });
}

// Variants (daily or weekly lenses, sizes of one drum) share one model, so they ride with their root
// instead of taking a batch slot each.
const byId = new Map(rows.map((r) => [r.cdda, r]));
const rootOf = (r, seen = new Set()) => {
  if (seen.has(r.cdda)) {
    return r;
  }
  seen.add(r.cdda);
  const up = byId.get(r.looksLike) ?? byId.get(r.copyFrom);
  return up && up !== r ? rootOf(up, seen) : r;
};
for (const r of rows) {
  const head = rootOf(r);
  if (head !== r) {
    head.variants = head.variants ?? [];
    head.variants.push({ cdda: r.cdda, name: r.name, weightG: r.weightG, volumeMl: r.volumeMl });
  }
}
const roots = rows.filter((r) => rootOf(r) === r);
const variantCount = rows.length - roots.length;
rows.length = 0;
rows.push(...roots);
rows.sort((a, b) => a.group.localeCompare(b.group) || a.cdda.localeCompare(b.cdda));

// Batches keep one source group together, so similar things share families and one reviewer's eye.
const batches = [];
let current = [];
for (const row of rows) {
  if (
    current.length >= BATCH ||
    (current.length > 0 && current[0].group !== row.group && current.length >= BATCH / 2)
  ) {
    batches.push(current);
    current = [];
  }
  current.push(row);
}
if (current.length > 0) {
  batches.push(current);
}

const out = resolve(values.out);
mkdirSync(join(out, 'batches'), { recursive: true });
writeFileSync(join(out, 'catalogue.json'), `${JSON.stringify(rows, null, 1)}\n`);
for (const [i, b] of batches.entries()) {
  writeFileSync(
    join(out, 'batches', `batch-${String(i + 1).padStart(3, '0')}.json`),
    `${JSON.stringify(b, null, 1)}\n`,
  );
}
const index = batches.map(
  (b, i) =>
    `batch-${String(i + 1).padStart(3, '0')}  ${b[0].group}\n${b.map((r) => `  ${r.cdda.padEnd(32)} ${r.name.padEnd(36)} ${String(r.weightG).padStart(8)} g ${String(r.volumeMl).padStart(7)} ml  ${r.materials.join(',')}${r.unitsPerStack ? `  per unit x${r.unitsPerStack}` : ''}${r.variants ? `  +${r.variants.length} variants` : ''}`).join('\n')}`,
);
writeFileSync(join(out, 'batches.txt'), `${index.join('\n\n')}\n`);
const groups = Object.entries(Object.groupBy(rows, (r) => r.group)).map(
  ([g, r]) => `${String(r.length).padStart(4)} ${g}`,
);
const headline = `${rows.length} models to author (+${variantCount} variants riding along) in ${batches.length} batches; ${skippedExisting.length} already in skelly`;
writeFileSync(join(out, 'summary.txt'), `${headline}\n\n${groups.join('\n')}\n`);
console.log(`${headline} -> ${out}`);
