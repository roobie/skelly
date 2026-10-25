import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { it } from 'node:test';
import {
  adaptMainInteractionPick,
  mainArrivalGit,
  mainOverlayPath,
  mainOverlaySources,
  mainSourceOverlays,
  overlayBoundaryGaps,
  paletteFreeFigure,
  removedExports,
  removedModuleExports,
  workspaceDirectory,
} from '../packages/deadvox/test/browser/sky-main-arrival.mjs';

it('main rendering overlays retain branch core API owners', () => {
  assert.ok(mainSourceOverlays.length > 0);
  assert.ok(mainSourceOverlays.every((path) => !path.startsWith('core/')));
});

it('main overlays keep play, view and their presentation constructor contracts on the same revision', () => {
  assert.ok(mainSourceOverlays.includes('game/play.ts'));
  assert.ok(mainSourceOverlays.includes('render/playView.ts'));
  assert.ok(mainSourceOverlays.includes('render/playerFigure.ts'));
  assert.ok(mainSourceOverlays.includes('render/hands.ts'));
  assert.ok(mainSourceOverlays.includes('render/heldDisplay.ts'));
  assert.ok(mainSourceOverlays.includes('render/acidEffects.ts'));
  assert.ok(mainSourceOverlays.includes('render/gore.ts'));
  assert.ok(mainSourceOverlays.includes('render/mobActors.ts'));
  assert.ok(mainSourceOverlays.includes('render/heightFog.ts'));
  assert.ok(mainSourceOverlays.includes('bench/post.ts'));
  assert.ok(mainSourceOverlays.includes('game/damageFeedback.ts'));
  assert.ok(mainSourceOverlays.includes('game/painCue.ts'));
});

it('main play overlays keep the entire UI boundary on the base even when export names survive signature changes', () => {
  const basePaths = new Set([
    'ui/options.ts',
    'ui/nested/readout.ts',
    'ui/style.css',
    'core/rules.ts',
    'game/unrelated.ts',
  ]);
  const sources = mainOverlaySources(basePaths);
  assert.ok(sources.includes('ui/options.ts'));
  assert.ok(sources.includes('ui/nested/readout.ts'));
  assert.ok(!sources.includes('core/rules.ts'));
  assert.ok(!sources.includes('game/unrelated.ts'));
  assert.ok(!sources.includes('ui/style.css'));
});

it('main picker callers supply both branch reach predicates without changing an already-current caller', () => {
  const source = `return pickInteractionTarget({
      worldSeed: config.seed,
      isSolid: engine.isOpaque,
    });`;
  const physical = () => true;
  const sight = () => false;
  const adapted = adaptMainInteractionPick(source);
  const pick = Function('engine', 'config', 'pickInteractionTarget', adapted);
  const options = pick({ isSolid: physical, isOpaque: sight }, { seed: 1 }, (input) => input);
  assert.equal(options.isSolid, physical);
  assert.equal(options.isOpaque, sight);
  assert.equal(adaptMainInteractionPick(adapted), adapted);
});

it('main imports of an export the branch removed are found, and type-only or kept exports are not', () => {
  const base = `export const kept = 1;
export const dropped = () => 2;
export async function droppedFn() {}
export interface DroppedType {}
export type DroppedAlias = number;
const local = 3;
export { local as renamed, type DroppedType as Listed };`;
  const branch = `export const kept = 1;
const dropped = () => 2;`;
  assert.deepEqual(removedExports(base, branch).sort(), ['dropped', 'droppedFn', 'renamed']);
  assert.deepEqual(removedExports(branch, base), []);
});

it('branch modules beside the overlays are refused a name the overlaid base copy lacks, until the overlay takes them too', () => {
  const base = new Map([['render/figure.ts', 'export const SHOULDER = 1;\nexport interface Pose {}\n']]);
  const branch = new Map([
    ['render/figure.ts', 'export const SHOULDER = 1;\nexport const shoulderOf = () => 1;\n'],
    [
      'render/hands.ts',
      "import {\n  SHOULDER,\n  shoulderOf as shoulder,\n} from './figure.ts';\nimport type { Pose } from './figure.ts';\n",
    ],
    [
      'game/play.ts',
      "import './style.css';\nimport { type Pose, SHOULDER } from '../render/figure.ts';\nimport { Group } from 'three';\n",
    ],
  ]);
  assert.deepEqual(overlayBoundaryGaps(base, branch), [
    { importer: 'render/hands.ts', module: 'render/figure.ts', names: ['shoulderOf'] },
  ]);
  base.set('render/hands.ts', "import { SHOULDER } from './figure.ts';\n");
  assert.deepEqual(overlayBoundaryGaps(base, branch), []);
});

it('main figure sources take a fixed palette when the branch row has none, and a palette-free figure is left alone', () => {
  const source = `const PLAYER_COLORS: Readonly<Record<Part, keyof FigureDef['palette']>> = {};
export const createFirstPersonArm = (palette: FigureDef['palette'], side: HandSide, grip: Vec3): Group => {
  const shirt = palette.shirt;
};
class PlayerMeshes {
  constructor(figure: FigureDef) {
    const { palette } = figure;
    use(palette.skin);
  }
}`;
  const adapted = paletteFreeFigure(source);
  assert.ok(!adapted.includes('const { palette } = figure;'));
  assert.match(adapted, ROW_PALETTE_FALLBACK);
  assert.match(adapted, ARM_PALETTE_FALLBACK);
  const free = 'export class PlayerMeshes {}';
  assert.equal(paletteFreeFigure(free), free);
  assert.throws(() => paletteFreeFigure("type P = FigureDef['palette'];"), UNEXPECTED_PALETTE_SHAPE);
});

const ROW_PALETTE_FALLBACK = /const palette = figure\.palette \?\? \{/;
const ARM_PALETTE_FALLBACK = /given: FigureDef\['palette'\] \| undefined[^\n]*\n {2}const palette = given \?\? \{/;
const UNEXPECTED_PALETTE_SHAPE = /update paletteFreeFigure/;

const MISSING_WORKSPACE = /No workspace package named missing/;

it('main reads find the package where each revision places it, after the branch moves it', () => {
  const repository = mkdtempSync(join(tmpdir(), 'main-first-mesh-'));
  // biome-ignore lint/style/noProcessEnv: a pre-push hook exports GIT_DIR and its kin, which would aim the fixture's commits at the pushing repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', env }).trim();
  try {
    const { base, branch } = movedPackageHistory(repository, git);
    assert.equal(workspaceDirectory(git, base, 'deadvox'), 'game');
    assert.equal(workspaceDirectory(git, branch, 'deadvox'), 'packages/deadvox');
    assert.throws(() => workspaceDirectory(git, base, 'missing'), MISSING_WORKSPACE);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

it('main arrival Git commands ignore inherited repository bindings at discovery and subsequent commands', () => {
  const repository = mkdtempSync(join(tmpdir(), 'main-arrival-bindings-'));
  // biome-ignore lint/style/noProcessEnv: fixture Git must never inherit a hook's repository bindings.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', env }).trim();
  const foreign = join(repository, 'foreign');
  // biome-ignore lint/style/noProcessEnv: exercise the real subprocess boundary with hostile inherited bindings.
  const previous = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
  try {
    const { branch } = movedPackageHistory(repository, git);
    mkdirSync(foreign);
    execFileSync('git', ['init', '-q', foreign], { env });
    // biome-ignore lint/style/noProcessEnv: these bindings are the regression input, restored below.
    Object.assign(process.env, { GIT_DIR: join(foreign, '.git'), GIT_WORK_TREE: foreign });
    const actual = mainArrivalGit(join(repository, 'packages/deadvox'));
    assert.equal(actual(['rev-parse', '--show-toplevel']), repository);
    assert.equal(actual(['rev-parse', 'HEAD']), branch);
    assert.equal(workspaceDirectory(actual, 'HEAD', 'deadvox'), 'packages/deadvox');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        // biome-ignore lint/style/noProcessEnv: restore the caller's environment exactly.
        delete process.env[key];
      } else {
        // biome-ignore lint/style/noProcessEnv: restore the caller's environment exactly.
        process.env[key] = value;
      }
    }
    rmSync(repository, { recursive: true, force: true });
  }
});

function movedPackageHistory(repository, git) {
  const write = (path, value) => {
    mkdirSync(join(repository, path, '..'), { recursive: true });
    writeFileSync(join(repository, path), JSON.stringify(value));
  };
  const commit = (message) => {
    git(['add', '-A']);
    git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message]);
    return git(['rev-parse', 'HEAD']);
  };
  git(['init', '-q']);
  write('package.json', { workspaces: ['other', 'game'] });
  write('other/package.json', { name: 'other' });
  write('game/package.json', { name: 'deadvox' });
  const base = commit('base');
  git(['rm', '-rq', 'game']);
  write('packages/deadvox/package.json', { name: 'deadvox' });
  write('package.json', { workspaces: ['other', 'packages/deadvox'] });
  return { base, branch: commit('move') };
}

it('main imports of an export the branch removed from a sibling package are found where each revision keeps it', () => {
  const repository = mkdtempSync(join(tmpdir(), 'main-sibling-export-'));
  // biome-ignore lint/style/noProcessEnv: a pre-push hook exports GIT_DIR and its kin, which would aim the fixture's commits at the pushing repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', env }).trim();
  const write = (path, text) => {
    mkdirSync(join(repository, path, '..'), { recursive: true });
    writeFileSync(join(repository, path), text);
  };
  const commit = (message) => {
    git(['add', '-A']);
    git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message]);
    return git(['rev-parse', 'HEAD']);
  };
  try {
    git(['init', '-q']);
    write('package.json', JSON.stringify({ workspaces: ['game', 'mob'] }));
    write('game/package.json', JSON.stringify({ name: 'deadvox' }));
    write('mob/package.json', JSON.stringify({ name: 'mobgen' }));
    write('mob/src/cut.ts', 'export const cut = 1;\nexport const PARTS = [];\n');
    write('mob/src/kept.ts', 'export const kept = 1;\n');
    const base = commit('base');
    git(['mv', 'mob', 'packages-mobgen']);
    write('package.json', JSON.stringify({ workspaces: ['game', 'packages-mobgen'] }));
    write('packages-mobgen/src/cut.ts', 'export const cut = 1;\n');
    commit('move and drop');
    const { removedFrom, shimmed } = removedModuleExports(git, base);
    const top = git(['rev-parse', '--show-toplevel']);
    assert.deepEqual(removedFrom(join(top, 'packages-mobgen/src/cut.ts')), ['PARTS']);
    assert.deepEqual(removedFrom(join(top, 'packages-mobgen/src/kept.ts')), []);
    assert.deepEqual(shimmed(), { 'packages-mobgen/src/cut.ts': ['PARTS'] });
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

it('main overlays accept the directory URL trailing separator and worker module query', () => {
  const root = resolve('fixture-root');
  const id = `${root}/src/worker/mesh.worker.ts?worker_file&type=module`;
  for (const directory of [root, `${root}/`]) {
    assert.equal(mainOverlayPath(directory, id), 'worker/mesh.worker.ts');
  }
  assert.equal(mainOverlayPath(root, resolve('unrelated/worker.ts')), null);
});
