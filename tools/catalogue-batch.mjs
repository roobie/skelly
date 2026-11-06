// Runs catalogue batches: one worktree and branch per batch, so parallel authors never share compiled
// files, and one row file per batch created up front but imported only when it lands, so batch branches
// merge without conflicts and keep generated output fresh.
// The why is in things/TASK-catalogue-breadth.md.
//
// Entry point for an orchestrator: node tools/catalogue-batch.mjs runbook
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    catalogue: { type: 'string' },
    base: { type: 'string' },
    'no-setup': { type: 'boolean', default: false },
  },
});
const [command, ...rest] = positionals;
const run = (cmd, args, cwd, stdio = 'inherit') => execFileSync(cmd, args, { cwd, stdio, encoding: 'utf8' });
const git = (args, cwd = process.cwd()) => run('git', args, cwd, 'pipe').trim();
const tryGit = (args, cwd) => {
  try {
    return git(args, cwd);
  } catch {
    // A failing git command answers "no" here: missing ref, not an ancestor, no such file.
    return null;
  }
};
const top = git(['rev-parse', '--show-toplevel']);
const mainCheckout = dirname(resolve(top, git(['rev-parse', '--git-common-dir'])));
const pad = (n) => String(Number(n)).padStart(3, '0');
const batchName = (n) => `batch-${pad(n)}`;
const ROWS = 'packages/thing-authoring-tool/catalogue';
const DRAFTS = 'things/catalogue-drafts';
const ITEMS = 'packages/thing-authoring-tool/items.jsonnet';
const BATCH_FILE = /^batch-(\d+)\.libsonnet$/;
const BATCH_WORKTREE = /^catalogue-(\d+)$/;
const INDEX = `${ROWS}/index.libsonnet`;
// Root-relative, so the look step can overlay an index that adds the batch under review.
const INDEX_IMPORT = `(import '${INDEX}')`;
const indexText = (ns) => `${['[]', ...ns.map((n) => `(import '${ROWS}/${batchName(n)}.libsonnet')`)].join('\n+ ')}\n`;
const indexed = (text) => [...text.matchAll(/batch-(\d+)\.libsonnet/g)].map(([, n]) => Number(n));
const INTEGRATION = 'things/catalogue-breadth';
const CDDA_REPO = 'https://github.com/CleverRaven/Cataclysm-DDA.git';
// Every host builds the same batches from this release; the prepare step pins it with the Skelly commit.
const CDDA_TAG = 'cdda-0.I-2026-09-19-2324';
const DRAFT_FILE = /^batch-\d+\.json$/;
const PIN = `${DRAFTS}/pin.json`;
const workDir = resolve(values.catalogue ?? join(mainCheckout, '.catalogue'));
const refDir = join(workDir, 'reference');

const readAt = (rev, path) => tryGit(['show', `${rev}:${path}`]);
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined);
const trackedPin = (rev) => {
  const text = readAt(rev, PIN);
  return text ? JSON.parse(text) : undefined;
};
const localPin = () => readJson(join(refDir, 'pin.json'));
const currentBranch = () => git(['rev-parse', '--abbrev-ref', 'HEAD']);
function requireIntegration(step) {
  if (currentBranch() !== INTEGRATION) {
    throw new Error(`${step} runs in a checkout of ${INTEGRATION}`);
  }
}
// Batches start from the integration branch: this checkout when it is that branch, else what origin has.
function integrationRev() {
  if (values.base) {
    return values.base;
  }
  if (currentBranch() === INTEGRATION) {
    return 'HEAD';
  }
  tryGit(['fetch', '-q', 'origin', INTEGRATION]);
  return tryGit(['rev-parse', '--verify', '-q', `origin/${INTEGRATION}`]) ? `origin/${INTEGRATION}` : 'HEAD';
}

// The mods the catalogue's mod waves read; see tools/cdda-reference.mjs, WAVES.
const CDDA_DIRS = ['data/json', 'data/mods/Magiclysm', 'data/mods/MindOverMatter'];

function cddaCheckout(tag) {
  const checkout = join(workDir, 'cdda');
  if (!existsSync(checkout)) {
    mkdirSync(workDir, { recursive: true });
    run('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', tag, CDDA_REPO, checkout]);
  }
  if (!CDDA_DIRS.every((dir) => existsSync(join(checkout, dir)))) {
    run('git', ['-C', checkout, 'sparse-checkout', 'set', ...CDDA_DIRS]);
  }
  const tags = (tryGit(['tag', '--points-at', 'HEAD'], checkout) ?? '').split('\n');
  if (!tags.includes(tag)) {
    throw new Error(`${checkout} is not at ${tag}; delete it and run catalogue again`);
  }
  return checkout;
}

function catalogue() {
  const base = integrationRev();
  const pinned = trackedPin(base);
  const tag = pinned?.cdda ?? CDDA_TAG;
  const at = pinned?.skelly ?? git(['rev-parse', base]);
  const checkout = cddaCheckout(tag);
  run(
    process.execPath,
    [join(top, 'tools/cdda-reference.mjs'), '--cdda', join(checkout, 'data/json'), '--out', refDir, '--at', at],
    top,
  );
  const sha256 = createHash('sha256')
    .update(readFileSync(join(refDir, 'catalogue.json')))
    .digest('hex');
  const batches = readdirSync(join(refDir, 'batches')).length;
  writeFileSync(join(refDir, 'pin.json'), `${JSON.stringify({ cdda: tag, skelly: at, sha256, batches }, null, 2)}\n`);
  if (pinned && pinned.sha256 !== sha256) {
    throw new Error(`built a catalogue that differs from ${PIN}; the extractor changed since prepare`);
  }
  console.log(`catalogue ready: ${refDir}`);
}

function prepare(range) {
  requireIntegration('prepare');
  const pin = localPin();
  if (!pin) {
    throw new Error('no catalogue on this host; run: node tools/catalogue-batch.mjs catalogue');
  }
  if (trackedPin('HEAD') && trackedPin('HEAD').sha256 !== pin.sha256) {
    throw new Error(`this host's catalogue differs from ${PIN}; run catalogue again`);
  }
  const [first, last = first] = (range ?? `1..${pin.batches}`).split('..').map(Number);
  mkdirSync(join(top, ROWS), { recursive: true });
  mkdirSync(join(top, DRAFTS), { recursive: true });
  for (let n = first; n <= last; n++) {
    const rows = join(top, ROWS, `${batchName(n)}.libsonnet`);
    if (!existsSync(rows)) {
      writeFileSync(rows, "local h = import '../compound.libsonnet';\n[\n]\n");
    }
    const drafts = join(top, DRAFTS, `${batchName(n)}.json`);
    if (!existsSync(drafts)) {
      writeFileSync(drafts, '[]\n');
    }
  }
  const batches = readdirSync(join(top, ROWS)).filter((f) => BATCH_FILE.test(f));
  const index = join(top, INDEX);
  writeFileSync(index, indexText(existsSync(index) ? indexed(readFileSync(index, 'utf8')) : []));
  const items = readFileSync(join(top, ITEMS), 'utf8');
  if (!items.includes(INDEX_IMPORT)) {
    const anchor = "(import 'worn-carry.libsonnet') +";
    if (!items.includes(anchor)) {
      throw new Error(`${ITEMS} changed shape; add ${INDEX_IMPORT} to its items by hand`);
    }
    writeFileSync(join(top, ITEMS), items.replace(anchor, `${anchor} ${INDEX_IMPORT} +`));
  }
  writeFileSync(join(top, PIN), `${JSON.stringify(pin, null, 2)}\n`);
  git(['add', ROWS, DRAFTS, ITEMS]);
  git(['commit', '-q', '-m', `Prepare catalogue batches ${pad(first)} to ${pad(last)}`]);
  console.log(`prepared ${batches.length} batch files and committed; push ${INTEGRATION} before starting batches`);
}

function checkStartable(n, base) {
  const name = batchName(n);
  if (!readAt(base, `${ROWS}/${name}.libsonnet`)) {
    throw new Error(`${name} is not prepared on ${base}; run prepare first`);
  }
  if (localPin()?.sha256 !== trackedPin(base)?.sha256) {
    throw new Error(`this host's catalogue is missing or differs from ${PIN}; run catalogue`);
  }
  if (tryGit(['ls-remote', '--heads', 'origin', `things/catalogue-${pad(n)}`])) {
    throw new Error(`${name} is already pushed from somewhere; pick an open batch (see runbook)`);
  }
}

function start(n) {
  const base = integrationRev();
  const name = batchName(n);
  const wt = join(mainCheckout, '.claude/worktrees', `catalogue-${pad(n)}`);
  const branch = `things/catalogue-${pad(n)}`;
  if (!existsSync(wt)) {
    checkStartable(n, base);
    git(['worktree', 'add', '-q', '-b', branch, wt, base]);
    if (!values['no-setup']) {
      run('npm', ['run', 'setup'], wt);
    }
  }
  const reference = join(refDir, 'batches', `${name}.json`);
  mkdirSync(join(wt, '.catalogue'), { recursive: true });
  writeFileSync(join(wt, '.catalogue/reference.json'), readFileSync(reference));
  const rows = JSON.parse(readFileSync(reference, 'utf8'));
  writeFileSync(join(wt, '.catalogue/BRIEF.md'), brief(name, branch, rows));
  console.log(
    `${wt}\n  branch ${branch}, ${rows.length} items\n  agent prompt: "Read .catalogue/BRIEF.md in this worktree and carry it out."`,
  );
}

// One key order for every draft, so batches written by different agents diff and merge cleanly.
// Listed keys come first in this order; any other key follows alphabetically, before the prose keys.
const KEY_ORDER = {
  item: [
    'id',
    'model',
    'name',
    'category',
    'size',
    'weight',
    'mass',
    'stack',
    'economy',
    'tool',
    'workstation',
    'wearable',
    'container',
    'attachPoints',
    'fits',
  ],
  prose: ['finishes', 'description', 'reference', 'variants', 'notes'],
  economy: ['usage', 'tiers'],
  wearable: ['slot', 'encumbrance', 'warmth', 'wearPerDamage', 'protects'],
  container: ['rigid', 'pockets'],
};
function ordered(value, first = [], last = []) {
  if (Array.isArray(value)) {
    return value.map((entry) => ordered(entry));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const keys = Object.keys(value);
  const middle = keys.filter((k) => !(first.includes(k) || last.includes(k))).sort();
  return Object.fromEntries(
    [...first, ...middle, ...last]
      .filter((k) => Object.hasOwn(value, k))
      .map((k) => [k, ordered(value[k], KEY_ORDER[k] ?? [])]),
  );
}
function tidy() {
  const dir = join(top, DRAFTS);
  const files = readdirSync(dir).filter((f) => DRAFT_FILE.test(f));
  for (const f of files) {
    const items = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const tidied = items.map((item) => ordered(item, KEY_ORDER.item, KEY_ORDER.prose));
    // Compact output leaves layout to biome alone, so it follows from the data, not from how a draft was typed.
    writeFileSync(join(dir, f), `${JSON.stringify(tidied)}\n`);
  }
  run(process.execPath, [join(top, 'node_modules/@biomejs/biome/bin/biome'), 'format', '--write', DRAFTS], top, 'pipe');
  console.log(`tidied ${files.length} draft files`);
}

function land(ns) {
  requireIntegration('land');
  git(['fetch', 'origin']);
  for (const n of ns) {
    // Batches from other hosts arrive through origin; a batch run on this host may not be pushed yet.
    const local = `things/catalogue-${pad(n)}`;
    const branch = git(['branch', '-r', '--list', `origin/${local}`]) ? `origin/${local}` : local;
    git(['merge', '--no-ff', '-q', '-m', `Merge catalogue ${batchName(n)}`, branch]);
    console.log(`merged ${branch}`);
  }
  const index = join(top, INDEX);
  const landed = new Set([...indexed(readFileSync(index, 'utf8')), ...ns.map(Number)]);
  writeFileSync(index, indexText([...landed].sort((a, b) => a - b)));
  tidy();
  run('npm', ['run', 'export:deadvox'], top);
  git(['add', '-A', 'packages', DRAFTS]);
  if (git(['diff', '--cached', '--name-only'])) {
    git(['commit', '-q', '-m', `Export catalogue batches ${ns.map(pad).join(', ')}`]);
  }
  // The sheet lists a model it could not draw, and the merge and commit are already done, so its failure is not a crash.
  try {
    run(process.execPath, [join(top, 'tools/model-sheet.mjs'), '--out', join(top, '.catalogue/sheet')], top);
  } catch {
    console.error('the contact sheet has failed rows: look for them on the sheet');
  }
  console.log(`review the contact sheet: ${join(top, '.catalogue/sheet/index.html')}`);
}

// ---------- runbook ----------
function batchState(n, base, here) {
  const remote = `origin/things/catalogue-${pad(n)}`;
  if (!tryGit(['rev-parse', '--verify', '-q', remote])) {
    return { n, stage: here.has(n) ? 'started here, not pushed' : 'open' };
  }
  if (tryGit(['merge-base', '--is-ancestor', remote, base]) !== null) {
    return { n, stage: 'landed' };
  }
  const drafts = JSON.parse(readAt(remote, `${DRAFTS}/${batchName(n)}.json`) ?? '[]').length;
  const items = readJson(join(refDir, 'batches', `${batchName(n)}.json`))?.length;
  return { n, stage: items !== undefined && drafts >= items ? 'done' : 'in progress' };
}

function runbookState() {
  tryGit(['fetch', '-q', 'origin']);
  const base = integrationRev();
  const prepared = (tryGit(['ls-tree', '--name-only', `${base}:${ROWS}`]) ?? '')
    .split('\n')
    .map((f) => BATCH_FILE.exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  const here = new Set(
    git(['worktree', 'list', '--porcelain'])
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => BATCH_WORKTREE.exec(basename(line.slice('worktree '.length)))?.[1])
      .filter(Boolean)
      .map(Number),
  );
  const onIntegration = currentBranch() === INTEGRATION;
  const published = Boolean(tryGit(['rev-parse', '--verify', '-q', `origin/${INTEGRATION}`]));
  const unpushed = onIntegration && published ? Number(git(['rev-list', '--count', `origin/${INTEGRATION}..HEAD`])) : 0;
  return {
    onIntegration,
    published,
    unpushed,
    pin: trackedPin(base),
    local: localPin(),
    batches: prepared.map((n) => batchState(n, base, here)),
  };
}

const ranges = (ns) =>
  ns
    .reduce((acc, n) => {
      const last = acc.at(-1);
      if (last && last[1] === n - 1) {
        last[1] = n;
      } else {
        acc.push([n, n]);
      }
      return acc;
    }, [])
    .map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`))
    .join(', ');
const inStage = (state, stage) => state.batches.filter((b) => b.stage === stage).map((b) => b.n);

function setupSteps(state) {
  const steps = [];
  if (!state.local) {
    steps.push("Build this host's catalogue: node tools/catalogue-batch.mjs catalogue");
  } else if (state.pin && state.pin.sha256 !== state.local.sha256) {
    steps.push(`This host's catalogue differs from ${PIN}: delete ${refDir} and run catalogue`);
  }
  if (state.batches.length === 0) {
    steps.push(
      state.onIntegration
        ? 'Create the batch files: node tools/catalogue-batch.mjs prepare'
        : `Nothing is prepared yet: prepare runs in the integration checkout of ${INTEGRATION}`,
    );
  }
  if (state.onIntegration && (!state.published || state.unpushed > 0)) {
    steps.push(`Push ${INTEGRATION} so other hosts and batches see it: git push -u origin ${INTEGRATION}`);
  }
  return steps;
}

function loopSteps(state) {
  const steps = [];
  const done = inStage(state, 'done');
  const open = inStage(state, 'open');
  if (done.length > 0) {
    steps.push(
      `Land the done batches${state.onIntegration ? '' : ` from the ${INTEGRATION} checkout`}: node tools/catalogue-batch.mjs land ${done.join(' ')}`,
    );
  }
  if (open.length > 0) {
    steps.push(
      `Dispatch open batches, one per free agent: node tools/catalogue-batch.mjs start <n>  (open: ${ranges(open)})`,
    );
  }
  if (state.batches.length > 0 && state.batches.every((b) => b.stage === 'landed')) {
    steps.push('Every batch has landed: show BR the contact sheet; the drafts wait for the refactor (#1532)');
  }
  return steps;
}

function runbook() {
  const state = runbookState();
  const stages = ['open', 'started here, not pushed', 'in progress', 'done', 'landed'];
  const status = stages
    .map((stage) => [stage, inStage(state, stage)])
    .filter(([, ns]) => ns.length > 0)
    .map(([stage, ns]) => `- ${stage}: ${ns.length} (${ranges(ns)})`);
  const steps = [...setupSteps(state), ...loopSteps(state)];
  console.log(
    `${RUNBOOK}\n## Status\n\n${status.length > 0 ? status.join('\n') : '- no batches prepared'}\n\n## Next\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`,
  );
}

const RUNBOOK = `# Catalogue breadth runbook

You orchestrate: dispatch batches to authoring agents, land finished ones, show BR the result.
Why the run works this way: things/TASK-catalogue-breadth.md. Re-run this command whenever you need to
know where things stand; it reads the state from git and prints the next steps below.

## Where to run

Run every command from a checkout of ${INTEGRATION}. On the host where batches land, that is the
integration worktree. On every other host, make a worktree of what origin has, and refresh it before you
dispatch there:

    git fetch origin
    git worktree add --detach <main checkout>/.claude/worktrees/catalogue-breadth origin/${INTEGRATION}
    git -C <that worktree> switch --detach origin/${INTEGRATION}

Each host builds its catalogue once with \`catalogue\`. The pinned release and commit make it identical
everywhere, and \`start\` refuses one that differs.

## Setup, once

1. Integration host: \`catalogue\`, then \`prepare\` (all batches), then push ${INTEGRATION}.
2. Every other host: the worktree above, then \`catalogue\`.

## Loop

- Dispatch: for each free agent, on its host, run \`start <n>\` with an open batch and give the agent the
  printed prompt in a fresh session. One batch per agent; batches are independent, so order does not
  matter. Authors push early, so a pushed batch counts as taken on every host.
- Watch: a batch is done when its drafts cover every reference item. Read each author's report for skips
  and wished finishes.
- Land: in the integration checkout, \`land <n>...\` for done batches, then show BR the contact sheet. Send a
  model BR rejects back to its batch branch with the notes, and land it again.
- Finishes: when several reports wish for the same finish, add it to
  packages/thing-core/src/materials.jsonnet on ${INTEGRATION} and push; batches started later get it.

## Limits

No PRs: the freeze in #1532. Batches never run the Deadvox export. No CDDA text enters the repository.
`;

// Clothing gets its inventory and ground model now; worn models wait for a fitted garment family.
const clothingBrief = `## Clothing

These items are worn. Model each as a player finds it on a shelf or the floor, not as worn: shirts, coats and
trousers folded, boots and shoes as a standing pair, gloves and socks as a flat pair, hats and helmets upright,
jewellery small at \`voxelGrain: 0.002\`. Do not author a worn model or \`figureModels\`; the draft's notes say
the worn look is pending.

Each reference row's \`worn\` gives what it covers, its encumbrance, warmth and layers. Give the draft a
\`wearable\` block as \`packages/deadvox/src/content/base/items-wearables.libsonnet\` does: \`slot\` (reuse
feet, legs, torso, vest, head, waist or back; name a new one such as hands, face or neck only when none fits,
and say so in the notes), \`encumbrance\`, \`warmth\`, \`wearPerDamage\`, and \`protects\` for armour.
Pockets go in \`container\` as the jeans have them. Sizes listed as variants (\`xl_\`, \`xs_\`) share the model.

Gear attaches to gear through typed points, so several pouches can be worn on one belt or vest:

- **Hosts** (belts, webbing vests, plate carriers, packs with lashing straps) keep their body slot and get
  \`attachPoints\`, each with \`id\`, \`name\` (lowercase player text), \`standard\` and \`reachSimSeconds\`:
  one point per pouch-sized area, with slower reach at the sides and back. A belt is the \`waist\` item.
  Model a host laid flat, outside up, so its points show, and name each point's spot in the notes.
- **Mounting gear** (belt pouches, webbing pouches, belt loops, sheaths, drop-on holsters) gets \`fits\`, the
  standards it mounts on, and no \`wearable.slot\`; it keeps encumbrance, warmth and wearPerDamage. Gear with
  its own harness or leg strap keeps a body slot (\`vest\`, \`thigh\`).
- **Loops** are both: \`fits\` to mount, and one point with a loop standard for the tool they hold. A tool
  that hangs in a loop gets \`fits\` with that loop standard.
- **Pockets** are grids only, sleeves and holsters included: size the grid to the thing it was made for, and
  restrict nothing.
- **Standards:** \`belt\`, \`pals\` (webbing), \`lash\` (pack straps), \`loop_small\`, \`loop_medium\`,
  \`loop_large\`, \`brigandine\` (laced points on a brigandine where shoulder guards and other add-on
  plates mount), \`helmet\` (side rails, clip slots, rim laces and rear patches on helmets and hard
  hats, where visors, face shields, mounted goggles, ear muffs, mail curtains and nape guards mount),
  \`mask_lens\` (the eyepiece mount on a gas mask, for lens inserts and outserts). Propose a new one in your report instead of using it in a draft.

`;

// Mod items are fantasy and psionic, so their authors need leave to model magical materials.
const modBrief = (rows) => {
  const mods = [...new Set(rows.map((r) => r.mod).filter(Boolean))];
  return mods.length === 0
    ? ''
    : `## Fantasy items

These items come from the Cataclysm: DDA mod${mods.length > 1 ? 's' : ''} ${mods.join(' and ')} (each row's \`mod\`), so
they are magical or psionic. Model the magic as material: glowing crystals, carved runes, odd metals, hide
and scale. Name each thing for what a player sees, not for the mod's lore or its proper nouns.

`;
};

const brief = (name, branch, rows) => `# Catalogue ${name}

You are adding ${rows.length} everyday items to the thing tool, so Deadvox's world has more things to find,
carry and use. Why the run works this way: \`things/TASK-catalogue-breadth.md\`.

## Your files

- Rows: \`${ROWS}/${name}.libsonnet\` (helpers from \`packages/thing-authoring-tool/compound.libsonnet\`). The build
  imports it only when the batch lands; the look step adds it for you.
- Item drafts for Deadvox: \`${DRAFTS}/${name}.json\`.
- Touch nothing else. If an item needs a new family or a family change, skip it and say so in its draft's \`notes\`.

## Reference

\`.catalogue/reference.json\` lists the items, with facts from Cataclysm: DDA (CC BY-SA 3.0): weight,
volume, longest side, materials, variants. Use those facts as a guide to scale. Never copy its descriptions or \`lookHint\` text
into anything; they only tell you what the thing looks like. Write every name and description yourself.
When \`unitsPerStack\` is set, weight and volume are per unit (one pill, one charge): model the package
or a single unit, whichever a player would pick up, and set its mass from that judgement.

## Read first

\`packages/thing-authoring-tool/README.md\`, \`things/README.md\` and \`packages/thing-export/README.md\` (voxel
grains), \`packages/thing-authoring-tool/hand-tools.libsonnet\` (compound rows), the families in
\`packages/thing-authoring-tool/src/families/\` (reuse one when it fits; compound is the fallback), finishes in
\`packages/thing-core/src/materials.jsonnet\`, and \`packages/deadvox/INTERFACE.md\`, "Text".

## Each item

1. Add a row: id in lowercase snake case, named in your own words; mass in kg estimated from your model
   and its materials, not copied from the reference weight; a comment giving its real-world size. Units are metres and **y is up**; a \`turned\`
   profile lists [position along the axis, radius] pairs; a held tool lies along x and sets \`handling\`
   as the hand tools do. Things smaller than a shoebox set \`voxelGrain: 0.004\` (0.002 below about 10 cm)
   so they do not read as a few blocks.
   Pick the nearest existing finish for each material. Do not add finishes: the palette is shared by every
   batch, so a new one would collide on merge; name the finish you wished for in your report.
2. Look: \`node tools/model-look.mjs --rows ${ROWS}/${name}.libsonnet --out .catalogue/look --ref .catalogue/reference.json <id>[=<referenceId>] ...\`
   Open the tiles (\`.catalogue/look/tiles/<id>.png\`: front, side, top, iso; grid 1 cm, bold 10 cm) and fix
   the row until the thing is recognisable from the iso view alone and every CHECK flag is fixed or
   explained in the draft's \`notes\`.
3. Draft its Deadvox item in the drafts file: \`id\`, \`model\` (the row id), \`name\`, \`category\`, \`size\`,
   \`economy\` (tiers and usage tags), tool qualities if any, \`description\`, \`reference\` (the reference id),
   \`variants\` (variant names that share this model) and \`notes\`. Mirror the fields of
   \`packages/deadvox/src/content/base/items-tools.libsonnet\`; the drafts are applied after the framework
   refactor, so they are not loaded yet. Quality names are open: a quality exists once something declares
   it, so give the qualities the thing would bring to crafting, reusing names already in use. A machine
   that stays where it stands also gets \`workstation: { id, qualities }\`, as the grinding wheel in
   \`packages/deadvox/src/content/base/furniture.jsonnet\` has.

${rows.some((r) => r.worn) ? clothingBrief : ''}${modBrief(rows)}Skip an item that makes no sense as a standalone model (fixed wiring, loose powder): add a draft with only
\`reference\` and \`notes\` saying why. Variants ride on their root's model; give them no rows.
A variant that differs only in colour, such as one gem on a shared ring, gets its own draft naming the shared
\`model\` and a \`finishes\` map from that model's slots to its own finishes. Every reference
item gets a draft, done or skipped: the orchestrator counts drafts to see that the batch is finished.

## Finish

- Every row passes the look step.
- Do not run \`npm run export:deadvox\`; the integration branch exports all batches at once.
- Commit every few items, plain English messages, ending with a Co-Authored-By trailer naming your own model.
- Push \`${branch}\` to origin after your first commit, so other hosts see the batch is taken, and after every
  commit after that. Open no PR. Cite no private work-item ids in commits.
- Report: items done, skipped (with why), and any family or finish you wished existed.
`;

const commands = {
  runbook: () => runbook(),
  catalogue: () => catalogue(),
  prepare: () => prepare(rest[0]),
  start: () => start(rest[0]),
  land: () => land(rest),
  tidy: () => tidy(),
};
const needsArgs = { start: 1, land: 1 };
if (!commands[command] || rest.length < (needsArgs[command] ?? 0)) {
  console.log(
    'usage: catalogue-batch.mjs runbook | catalogue | prepare [<first>..<last>] | start <n> | land <n>... | tidy',
  );
  console.log('options: --catalogue <dir> (default: .catalogue in the main checkout), --base <rev>, --no-setup');
  process.exit(1);
}
commands[command]();
