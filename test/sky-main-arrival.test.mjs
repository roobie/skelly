import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { it } from 'node:test';
import {
  adaptMainInteractionPick,
  mainOverlayPath,
  mainSourceOverlays,
  removedExports,
  workspaceDirectory,
} from '../packages/deadvox/test/browser/sky-main-arrival.mjs';

it('main rendering overlays retain branch core API owners', () => {
  assert.ok(mainSourceOverlays.length > 0);
  assert.ok(mainSourceOverlays.every((path) => !path.startsWith('core/')));
});

it('main overlays keep the play frame producer, consumer and acid effect contract on the same revision', () => {
  assert.ok(mainSourceOverlays.includes('game/play.ts'));
  assert.ok(mainSourceOverlays.includes('render/playView.ts'));
  assert.ok(mainSourceOverlays.includes('render/acidEffects.ts'));
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

it('main overlays accept the directory URL trailing separator and worker module query', () => {
  const root = resolve('fixture-root');
  const id = `${root}/src/worker/mesh.worker.ts?worker_file&type=module`;
  for (const directory of [root, `${root}/`]) {
    assert.equal(mainOverlayPath(directory, id), 'worker/mesh.worker.ts');
  }
  assert.equal(mainOverlayPath(root, resolve('unrelated/worker.ts')), null);
});
