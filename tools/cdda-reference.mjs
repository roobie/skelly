// Builds a reference catalogue of candidate items from a CDDA checkout, so batch authors know which
// everyday things exist and their size, weight and materials. CDDA is CC BY-SA 3.0, so the output is a
// scratch reference only and is never committed: authors write their own geometry and text.
// Usage: node tools/cdda-reference.mjs --cdda <checkout>/data/json --out <dir> [--at <commit>] [--batch 15] [--wave all|<name in WAVES>]
// tools/catalogue-batch.mjs runs it with a pinned release and commit; run it by hand only to explore.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    cdda: { type: 'string' },
    out: { type: 'string', default: 'cdda-reference' },
    at: { type: 'string' },
    batch: { type: 'string', default: '15' },
    wave: { type: 'string', default: 'all' },
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
function loadDefs(dir) {
  const defs = new Map();
  for (const file of walk(dir)) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    for (const o of Array.isArray(data) ? data : [data]) {
      if (o?.type !== 'ITEM') {
        continue;
      }
      const id = o.id ?? o.abstract;
      if (typeof id !== 'string') {
        continue;
      }
      defs.set(id, { ...o, sourceFile: relative(dir, file).replace(JSON_FILE, '') });
    }
  }
  return defs;
}
const coreDefs = loadDefs(join(root, 'items'));
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
function inherit(parent, own) {
  const out = { ...parent, ...own };
  out.abstract = undefined;
  adjust(out, own);
  if (own.extend?.qualities) {
    out.qualities = [...(parent.qualities ?? []), ...own.extend.qualities];
  }
  if (own.extend?.flags) {
    out.flags = [parent.flags ?? [], own.extend.flags].flat();
  }
  return out;
}
// Layers run from the mod down to the core, so mod items copy from core items. A mod item that copies
// from its own id overrides the core item and so resolves its parent one layer down.
function resolverOf(layers) {
  const resolved = new Map();
  const resolveDef = (id, from = 0, seen = new Set()) => {
    const layer = layers.findIndex((defs, i) => i >= from && defs.has(id));
    const key = `${layer}:${id}`;
    if (resolved.has(key)) {
      return resolved.get(key);
    }
    if (layer < 0 || seen.has(key)) {
      return;
    }
    seen.add(key);
    const own = layers[layer].get(id);
    const copyFrom = own['copy-from'];
    const parent = copyFrom ? (resolveDef(copyFrom, copyFrom === id ? layer + 1 : 0, seen) ?? {}) : {};
    const out = inherit(parent, own);
    resolved.set(key, out);
    return out;
  };
  return resolveDef;
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

// ---------- waves ----------
// The first wave holds rigid everyday things that fit a modern zombie survival setting. Guns are authored
// in the gun tool; the rest falls outside the setting. The clothing wave models garments as inventory and
// ground items only, because worn garments need a fitted family that does not exist yet.
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
// A wave names the source groups it draws from and the exclusions it lifts, so each wave's scope reads at
// a glance. Waves are numbered in this order, so a later wave never renumbers an earlier one's batches.
const WAVES = {
  first: {
    files:
      /^(tool\/(?!debug_tools|explosives|handloading)|generic(\/(bathroom_house|bedding|dining_kitchen|mail|music|spares|storage|string|toys_and_sports))?$|containers\/(containers|generic|lab|military)$|comestibles\/med$|appliances|electronics$|furniture\/|resources\/(?!alien|bone)|toy$)/,
    lifts: [],
  },
  // Integrated armour is mutation anatomy, and exoskeletons and lab suits fall outside the setting.
  clothing: {
    files: /^armor\/(?!bespoke_armor|integrated|combat_exoskeleton|robofac_armor|exotic|pets)/,
    lifts: ['ARMOR', 'armor', 'clothing'],
    // Clothing copies one base garment into many unlike ones, so only sizes of one garment, and jewellery
    // that differs only in gem or metal, share a model.
    sizesOnly: true,
  },
};
// Mod waves follow the core ones and hold only items the core lacks: a mod item that copies a concrete
// core item (an enchanted crowbar, a potion fruit) has that item's shape. Mods are fantasy and psionic
// by design, so the off-setting filter is lifted; files of spells, summoned or fake items, books and
// overrides stay out, as do the core's excluded subtypes and categories. Worn mod items get their own
// wave, as core clothing does. Mod items that copy one abstract template, such as a wand per spell,
// share one model.
const MOD_EXCLUDED_FILES =
  /^(fake|integrated|bionics|mutagen|vehicle|vehicle_parts|ammo|ammo_types|currency|books|books_lore|spellbooks|spell_scrolls|recipe_books|schematics|survivor_recipes|files_and_post_it|item_enchants|ethereal_items|psions_summon_items|tools\/pseudo|.*overrides)(\/|$)/;
const MOD_FILES = new RegExp(`^(?!${MOD_EXCLUDED_FILES.source.slice(1)})`);
for (const mod of ['Magiclysm', 'MindOverMatter']) {
  const modWave = { mod, files: MOD_FILES, offSetting: true };
  WAVES[mod] = { ...modWave, lifts: [], siblings: true };
  WAVES[`${mod}-clothing`] = { ...modWave, lifts: ['ARMOR', 'armor', 'clothing'], worn: true, sizesOnly: true };
}
const waveNames = values.wave === 'all' ? Object.keys(WAVES) : [values.wave];
for (const name of waveNames) {
  if (!WAVES[name]) {
    throw new Error(`--wave must be all or one of ${Object.keys(WAVES).join(', ')}`);
  }
}
const inWave = (wave, o) =>
  wave.files.test(o.sourceFile) &&
  (wave.worn === undefined || wave.worn === subtypesOf(o).includes('ARMOR')) &&
  !subtypesOf(o).some((s) => EXCLUDED_SUBTYPES.includes(s) && !wave.lifts.includes(s)) &&
  !(EXCLUDED_CATEGORIES.includes(categoryOf(o)) && !wave.lifts.includes(categoryOf(o))) &&
  !(EXCLUDED_FILES.test(o.sourceFile) && !wave.files.test(o.sourceFile));
const usable = (wave, o) =>
  o.id !== undefined &&
  !o.abstract &&
  !((!wave.offSetting && OFF_SETTING.test(`${o.id} ${nameOf(o.name)}`)) || DEBUG.test(o.id)) &&
  ![o.flags ?? []].flat().some((f) => ['PSEUDO', 'NO_DROP', 'ZERO_WEIGHT', 'TRADER_AVOID'].includes(f)) &&
  grams(o.weight) !== undefined &&
  millilitres(o.volume) !== undefined;
const SIZE_PREFIX = /^(xl|xs)_/;
const SIZE_SUFFIX = /_(xl|xs)$/;
const GEM_PREFIX =
  /^(alexandrite|amethyst|aquamarine|blue_topaz|citrine|diamond|emerald|garnet|opal|pearl|peridot|ruby|sapphire|tourmaline|topaz)_/;
const METAL_PREFIX = /^(gold|silver|platinum|copper|bronze|brass|steel|tin|pewter|titanium)_/;
const shapeKey = (id) =>
  id.replace(SIZE_PREFIX, '').replace(SIZE_SUFFIX, '').replace(GEM_PREFIX, '').replace(METAL_PREFIX, '');
// Worn facts tell a clothing author what the garment covers and how bulky it is.
const wornOf = (o) => {
  const parts = (o.armor ?? []).filter((a) => a && typeof a === 'object');
  if (parts.length === 0) {
    return;
  }
  const covers = [...new Set(parts.flatMap((a) => a.covers ?? []))];
  const encumbrance = Math.max(0, ...parts.map((a) => [a.encumbrance ?? 0].flat()[0]));
  const layers = [...new Set(parts.flatMap((a) => a.layers ?? []))];
  return { covers, encumbrance, warmth: o.warmth, layers: layers.length > 0 ? layers : undefined, sided: o.sided };
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
const skippedExisting = [];
const coveredByCore = [];
let variantCount = 0;
const rowOf = (wave, id, o) => ({
  cdda: id,
  mod: wave.mod,
  name: nameOf(o.name),
  group: wave.mod ? `${wave.mod}/${o.sourceFile}` : o.sourceFile,
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
  worn: wave.lifts.length > 0 ? wornOf(o) : undefined,
  // Reference for the shape only; never copy it into Deadvox text.
  lookHint: o.description ? nameOf(o.description) : undefined,
});
const coreResolve = resolverOf([coreDefs]);
const modDefs = new Map();
function waveSource(wave) {
  if (!wave.mod) {
    return { defs: coreDefs, resolve: coreResolve };
  }
  if (!modDefs.has(wave.mod)) {
    const defs = loadDefs(join(root, '../mods', wave.mod, 'items'));
    modDefs.set(wave.mod, { defs, resolve: resolverOf([defs, coreDefs]) });
  }
  return modDefs.get(wave.mod);
}
// True when the item is a core item, or copies one through any chain of mod items.
function copiesCore(defs, id, seen = new Set()) {
  if (coreDefs.get(id)?.id !== undefined) {
    return true;
  }
  const parent = defs.get(id)?.['copy-from'];
  if (!parent || seen.has(id)) {
    return false;
  }
  seen.add(id);
  return copiesCore(defs, parent, seen);
}
function waveRows(wave) {
  const rows = [];
  const { defs, resolve: resolveDef } = waveSource(wave);
  for (const id of defs.keys()) {
    const o = resolveDef(id);
    if (!(o && usable(wave, o) && inWave(wave, o))) {
      continue;
    }
    if (wave.mod && copiesCore(defs, id)) {
      coveredByCore.push(id);
      continue;
    }
    if (existing.has(norm(id)) || existing.has(norm(nameOf(o.name)))) {
      skippedExisting.push(id);
      continue;
    }
    rows.push(rowOf(wave, id, o));
  }
  return rows;
}

// Variants (daily or weekly lenses, sizes of one drum) share one model, so they ride with their root
// instead of taking a batch slot each. Each wave groups its own, so a later wave never moves an earlier
// wave's variants.
function variantRoots(wave, waveRowList) {
  const byId = new Map(waveRowList.map((r) => [r.cdda, r]));
  // The root of a shape is the row named by the shape itself, else the first row of it by id.
  const shapes = new Map();
  for (const r of [...waveRowList].sort((a, b) => a.cdda.localeCompare(b.cdda))) {
    const key = shapeKey(r.cdda);
    if (!shapes.has(key) || r.cdda === key) {
      shapes.set(key, r);
    }
  }
  const sizeRoot = (r) => shapes.get(shapeKey(r.cdda));
  // The first row by id that copies a template no row stands for.
  const templates = new Map();
  for (const r of [...waveRowList].sort((a, b) => a.cdda.localeCompare(b.cdda))) {
    if (wave.siblings && r.copyFrom && !byId.has(r.copyFrom) && !templates.has(r.copyFrom)) {
      templates.set(r.copyFrom, r);
    }
  }
  const rootOf = (r, seen = new Set()) => {
    if (wave.sizesOnly) {
      return sizeRoot(r);
    }
    if (seen.has(r.cdda)) {
      return r;
    }
    seen.add(r.cdda);
    const up = byId.get(r.looksLike) ?? byId.get(r.copyFrom) ?? templates.get(r.copyFrom);
    return up && up !== r ? rootOf(up, seen) : r;
  };
  for (const r of waveRowList) {
    const head = rootOf(r);
    if (head !== r) {
      head.variants = head.variants ?? [];
      head.variants.push({ cdda: r.cdda, name: r.name, weightG: r.weightG, volumeMl: r.volumeMl });
    }
  }
  const roots = waveRowList.filter((r) => rootOf(r) === r);
  variantCount += waveRowList.length - roots.length;
  return roots.sort((a, b) => a.group.localeCompare(b.group) || a.cdda.localeCompare(b.cdda));
}

// Batches keep one source group together, so similar things share families and one reviewer's eye.
function batchesOf(roots) {
  const batches = [];
  let current = [];
  for (const row of roots) {
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
  return batches;
}
function buildWave(wave) {
  const rows = variantRoots(wave, waveRows(wave));
  return { rows, batches: batchesOf(rows) };
}
const built = waveNames.map((name) => buildWave(WAVES[name]));
const rows = built.flatMap((w) => w.rows);
const batches = built.flatMap((w) => w.batches);

const out = resolve(values.out);
// Batch counts shrink when grouping changes, so leftover files would inflate the pinned count.
rmSync(join(out, 'batches'), { recursive: true, force: true });
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
const covered = coveredByCore.length > 0 ? `; ${coveredByCore.length} mod items covered by core items` : '';
const headline = `${rows.length} models to author (+${variantCount} variants riding along) in ${batches.length} batches; ${skippedExisting.length} already in skelly${covered}`;
writeFileSync(join(out, 'summary.txt'), `${headline}\n\n${groups.join('\n')}\n`);
console.log(`${headline} -> ${out}`);
