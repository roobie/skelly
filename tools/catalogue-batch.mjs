// Runs catalogue batches: one worktree and branch per batch, so parallel authors never share compiled
// files, and one row file per batch imported up front, so batch branches merge without conflicts.
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
const INDEX_IMPORT = "(import 'catalogue/index.libsonnet')";
const INTEGRATION = 'things/catalogue-breadth';
const CDDA_REPO = 'https://github.com/CleverRaven/Cataclysm-DDA.git';
// Every host builds the same batches from this release; the prepare step pins it with the Skelly commit.
const CDDA_TAG = 'cdda-0.I-2026-09-19-2324';
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

function cddaCheckout(tag) {
  const checkout = join(workDir, 'cdda');
  if (!existsSync(checkout)) {
    mkdirSync(workDir, { recursive: true });
    run('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', tag, CDDA_REPO, checkout]);
    run('git', ['-C', checkout, 'sparse-checkout', 'set', 'data/json']);
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
  const batches = readdirSync(join(top, ROWS))
    .filter((f) => BATCH_FILE.test(f))
    .sort();
  writeFileSync(join(top, ROWS, 'index.libsonnet'), `${batches.map((f) => `(import '${f}')`).join('\n+ ')}\n`);
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
  run('npm', ['run', 'export:deadvox'], top);
  if (git(['status', '--porcelain'])) {
    git(['add', '-A', 'packages']);
    git(['commit', '-q', '-m', `Export catalogue batches ${ns.map(pad).join(', ')}`]);
  }
  run(process.execPath, [join(top, 'tools/model-sheet.mjs'), '--out', join(top, '.catalogue/sheet')], top);
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
\`reference\` and \`notes\` saying why. Variants ride on their root's model; give them no rows. Every reference
item gets a draft, done or skipped: the orchestrator counts drafts to see that the batch is finished.

## Finish

- Every row passes the look step; \`npm test --workspace @skelly/thing-authoring-tool\` passes.
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
};
const needsArgs = { start: 1, land: 1 };
if (!commands[command] || rest.length < (needsArgs[command] ?? 0)) {
  console.log('usage: catalogue-batch.mjs runbook | catalogue | prepare [<first>..<last>] | start <n> | land <n>...');
  console.log('options: --catalogue <dir> (default: .catalogue in the main checkout), --base <rev>, --no-setup');
  process.exit(1);
}
commands[command]();
