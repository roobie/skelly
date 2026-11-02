// Runs catalogue batches: one worktree and branch per batch, so parallel authors never share compiled
// files, and one row file per batch imported up front, so batch branches merge without conflicts.
// The why is in things/TASK-catalogue-breadth.md.
//
//   node tools/catalogue-batch.mjs prepare <first>..<last>          on the integration branch
//   node tools/catalogue-batch.mjs start <n> --catalogue <dir>     creates the batch worktree and brief
//   node tools/catalogue-batch.mjs land <n>...                     merges pushed batches and exports
//
// <dir> is the output of tools/cdda-reference.mjs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
const top = git(['rev-parse', '--show-toplevel']);
const mainCheckout = dirname(resolve(top, git(['rev-parse', '--git-common-dir'])));
const pad = (n) => String(Number(n)).padStart(3, '0');
const batchName = (n) => `batch-${pad(n)}`;
const ROWS = 'packages/thing-authoring-tool/catalogue';
const DRAFTS = 'things/catalogue-drafts';
const ITEMS = 'packages/thing-authoring-tool/items.jsonnet';
const INDEX_IMPORT = "(import 'catalogue/index.libsonnet')";

function prepare(range) {
  const [first, last = first] = range.split('..').map(Number);
  mkdirSync(join(top, ROWS), { recursive: true });
  mkdirSync(join(top, DRAFTS), { recursive: true });
  for (let n = first; n <= last; n++) {
    const rows = join(top, ROWS, `${batchName(n)}.libsonnet`);
    if (!existsSync(rows)) writeFileSync(rows, "local h = import '../compound.libsonnet';\n[\n]\n");
    const drafts = join(top, DRAFTS, `${batchName(n)}.json`);
    if (!existsSync(drafts)) writeFileSync(drafts, '[]\n');
  }
  const batches = readdirSync(join(top, ROWS)).filter((f) => /^batch-\d+\.libsonnet$/.test(f)).sort();
  writeFileSync(join(top, ROWS, 'index.libsonnet'), `${batches.map((f) => `(import '${f}')`).join('\n+ ')}\n`);
  const items = readFileSync(join(top, ITEMS), 'utf8');
  if (!items.includes(INDEX_IMPORT)) {
    const anchor = "(import 'worn-carry.libsonnet') +";
    if (!items.includes(anchor)) throw new Error(`${ITEMS} changed shape; add ${INDEX_IMPORT} to its items by hand`);
    writeFileSync(join(top, ITEMS), items.replace(anchor, `${anchor} ${INDEX_IMPORT} +`));
  }
  git(['add', ROWS, DRAFTS, ITEMS]);
  git(['commit', '-q', '-m', `Prepare catalogue batches ${pad(first)} to ${pad(last)}`]);
  console.log(`prepared ${batches.length} batch files and committed; push this branch before starting batches on other hosts`);
}

function start(n) {
  if (!values.catalogue) throw new Error('--catalogue <dir> (output of tools/cdda-reference.mjs) is required');
  const name = batchName(n);
  const reference = join(resolve(values.catalogue), 'batches', `${name}.json`);
  if (!existsSync(reference)) throw new Error(`no ${reference}`);
  if (!existsSync(join(top, ROWS, `${name}.libsonnet`))) throw new Error(`${name} is not prepared on this branch; run prepare first`);
  const base = values.base ?? git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const wt = join(mainCheckout, '.claude/worktrees', `catalogue-${pad(n)}`);
  const branch = `things/catalogue-${pad(n)}`;
  if (!existsSync(wt)) {
    git(['worktree', 'add', '-b', branch, wt, base]);
    if (!values['no-setup']) run('npm', ['run', 'setup'], wt);
  }
  mkdirSync(join(wt, '.catalogue'), { recursive: true });
  writeFileSync(join(wt, '.catalogue/reference.json'), readFileSync(reference));
  const rows = JSON.parse(readFileSync(reference, 'utf8'));
  writeFileSync(join(wt, '.catalogue/BRIEF.md'), brief(name, branch, rows));
  console.log(`${wt}\n  branch ${branch}, ${rows.length} items\n  agent prompt: "Read .catalogue/BRIEF.md in this worktree and carry it out."`);
}

function land(ns) {
  git(['fetch', 'origin']);
  for (const n of ns) {
    const branch = `origin/things/catalogue-${pad(n)}`;
    git(['merge', '--no-ff', '-q', '-m', `Merge catalogue ${batchName(n)}`, branch]);
    console.log(`merged ${branch}`);
  }
  run('npm', ['run', 'export:deadvox'], top);
  if (git(['status', '--porcelain'])) {
    git(['add', '-A', 'packages']);
    git(['commit', '-q', '-m', `Export catalogue batches ${ns.map(pad).join(', ')}`]);
  }
  run(process.execPath, [join(top, 'tools/model-sheet.mjs'), '--out', join(top, '.catalogue/sheet')], top);
  console.log(`review the contact sheet: ${join(top, '.catalogue/sheet/index.html')}`);
}

const brief = (name, branch, rows) => `# Catalogue ${name}

You are adding ${rows.length} everyday items to the thing tool, so Deadvox's world has more things to find,
carry and use. Why the run works this way: \`things/TASK-catalogue-breadth.md\`.

## Your files

- Rows: \`${ROWS}/${name}.libsonnet\` (already imported; helpers from \`packages/thing-authoring-tool/compound.libsonnet\`).
- Item drafts for Deadvox: \`${DRAFTS}/${name}.json\`.
- Touch nothing else. If an item needs a new family or a family change, skip it and say so in its draft's \`notes\`.

## Reference

\`.catalogue/reference.json\` lists the items, with facts from Cataclysm: DDA (CC BY-SA 3.0): weight,
volume, longest side, materials, variants. Use those facts. Never copy its descriptions or \`lookHint\` text
into anything; they only tell you what the thing looks like. Write every name and description yourself.
When \`unitsPerStack\` is set, weight and volume are per unit (one pill, one charge): model the package
or a single unit, whichever a player would pick up, and set its mass from that judgement.

## Read first

\`packages/thing-authoring-tool/README.md\`, \`things/README.md\` and \`packages/thing-export/README.md\` (voxel
grains), \`packages/thing-authoring-tool/hand-tools.libsonnet\` (compound rows), the families in
\`packages/thing-authoring-tool/src/families/\` (reuse one when it fits; compound is the fallback), finishes in
\`packages/thing-core/src/materials.jsonnet\`, and \`packages/deadvox/INTERFACE.md\`, "Text".

## Each item

1. Add a row: id in lowercase snake case (the reference id when it reads well), mass in kg from the
   reference weight, a comment giving its real-world size. Units are metres and **y is up**; a \`turned\`
   profile lists [position along the axis, radius] pairs; a held tool lies along x and sets \`handling\`
   as the hand tools do. Things smaller than a shoebox set \`voxelGrain: 0.004\` (0.002 below about 10 cm)
   so they do not read as a few blocks.
   Pick the nearest existing finish for each material. Do not add finishes: the palette is shared by every
   batch, so a new one would collide on merge; name the finish you wished for in your report.
2. Look: \`node tools/model-look.mjs --out .catalogue/look --ref .catalogue/reference.json <id>[=<referenceId>] ...\`
   Open the tiles (\`.catalogue/look/tiles/<id>.png\`: front, side, top, iso; grid 1 cm, bold 10 cm) and fix
   the row until the thing is recognisable from the iso view alone and every CHECK flag is fixed or
   explained in the draft's \`notes\`.
3. Draft its Deadvox item in the drafts file: \`id\`, \`model\` (the row id), \`name\`, \`category\`, \`size\`,
   \`economy\` (tiers and usage tags), tool qualities if any, \`description\`, \`reference\` (the reference id),
   \`variants\` (variant names that share this model) and \`notes\`. Mirror the fields of
   \`packages/deadvox/src/content/base/items-tools.libsonnet\`; the drafts are applied after the framework
   refactor, so they are not loaded yet.

Skip an item that makes no sense as a standalone model (fixed wiring, loose powder): add a draft with only
\`reference\` and \`notes\` saying why. Variants ride on their root's model; give them no rows.

## Finish

- Every row passes the look step; \`npm test --workspace @skelly/thing-authoring-tool\` passes.
- Do not run \`npm run export:deadvox\`; the integration branch exports all batches at once.
- Commit every few items, plain English messages, ending with a Co-Authored-By trailer naming your own model.
- Push \`${branch}\` to origin. Open no PR. Cite no private work-item ids in commits.
- Report: items done, skipped (with why), and any family or finish you wished existed.
`;

const commands = { prepare: () => prepare(rest[0]), start: () => start(rest[0]), land: () => land(rest) };
if (!commands[command] || rest.length === 0) {
  console.log('usage: catalogue-batch.mjs prepare <first>..<last> | start <n> --catalogue <dir> | land <n>...');
  process.exit(1);
}
commands[command]();
