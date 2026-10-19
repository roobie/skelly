import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { it } from 'node:test';
import {
  adaptMainInteractionPick,
  mainOverlayPath,
  mainSourceOverlays,
} from '../deadvox/test/browser/sky-main-arrival.mjs';

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

it('main overlays accept the directory URL trailing separator and worker module query', () => {
  const root = resolve('fixture-root');
  const id = `${root}/src/worker/mesh.worker.ts?worker_file&type=module`;
  for (const directory of [root, `${root}/`]) {
    assert.equal(mainOverlayPath(directory, id), 'worker/mesh.worker.ts');
  }
  assert.equal(mainOverlayPath(root, resolve('unrelated/worker.ts')), null);
});
