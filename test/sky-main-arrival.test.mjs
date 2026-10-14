import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { mainOverlayPath, mainSourceOverlays } from '../deadvox/test/browser/sky-main-arrival.mjs';

it('main rendering overlays retain branch core API owners', () => {
  assert.ok(mainSourceOverlays.length > 0);
  assert.ok(mainSourceOverlays.every((path) => !path.startsWith('core/')));
});

it('main source overlays name existing source owners', async () => {
  assert.ok(mainSourceOverlays.length > 0);
  await Promise.all(mainSourceOverlays.map((path) => access(new URL(`../deadvox/src/${path}`, import.meta.url))));
});

it('main overlays accept the directory URL trailing separator and worker module query', () => {
  const root = resolve('fixture-root');
  const id = `${root}/src/worker/mesh.worker.ts?worker_file&type=module`;
  for (const directory of [root, `${root}/`]) {
    assert.equal(mainOverlayPath(directory, id), 'worker/mesh.worker.ts');
  }
  assert.equal(mainOverlayPath(root, resolve('unrelated/worker.ts')), null);
});
