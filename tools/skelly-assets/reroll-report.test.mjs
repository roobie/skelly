import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { mobBuilds, mobChanges } from './reroll-report.mjs';

const PACK = 'fixture.actors';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const genome = (params) => ({ template: 'mob:fixture', seed: 1, voxelSize: 0.05, params, wounds: [] });
const baked = (glb) => ({ glb, body: 'body', clips: 'clips' });
const build = (entries) => new Map(Object.entries(entries));

test('a changed body is re-rolled when its genome differs, rebuilt when only the build does, unknown without a genome', () => {
  const before = build({
    'p/rerolled': { files: baked('a'), genome: genome({ girth: 1, reach: 2 }) },
    'p/rebuilt': { files: baked('a'), genome: genome({ girth: 1, reach: 2 }) },
    'p/unrecorded': { files: baked('a') },
    'p/unchanged': { files: baked('a'), genome: genome({ girth: 1 }) },
  });
  const after = build({
    'p/rerolled': { files: baked('b'), genome: genome({ girth: 1, reach: 3 }) },
    // The same draws in another key order are one genome.
    'p/rebuilt': { files: baked('b'), genome: genome({ reach: 2, girth: 1 }) },
    'p/unrecorded': { files: baked('b'), genome: genome({ girth: 1 }) },
    'p/unchanged': { files: baked('a'), genome: genome({ girth: 9 }) },
  });
  assert.deepEqual(
    mobChanges(before, after).map(({ key, change, draws }) => ({ key, change, draws })),
    [
      { key: 'p/rebuilt', change: 'build', draws: [] },
      { key: 'p/rerolled', change: 'genome', draws: ['params.reach'] },
      { key: 'p/unrecorded', change: 'unrecorded', draws: [] },
    ],
  );
});

/** A pinned release of one mob in PACK, its GLB bytes and genome chosen, served from memory instead of GitHub. */
function fixtureRelease(scratch, { tag, glb, withGenome }) {
  const source = join(scratch, tag);
  const files = { glb: 'actors/mob.glb', body: 'actors/mob.body.json', clips: 'actors/mob.clips.json' };
  const genomeFile = 'actors/mob.genome.json';
  mkdirSync(join(source, PACK, 'actors'), { recursive: true });
  writeFileSync(join(source, PACK, files.glb), glb);
  writeFileSync(join(source, PACK, files.body), '{}');
  writeFileSync(join(source, PACK, files.clips), '{}');
  if (withGenome) {
    writeFileSync(join(source, PACK, genomeFile), JSON.stringify(genome({ girth: 1 })));
  }
  execFileSync('tar', ['-czf', join(source, 'pack.tar.gz'), '-C', source, PACK]);
  const model = { id: 'mob', kind: 'mob', pack: PACK, path: files.glb, body: files.body, clips: files.clips };
  const assets = {
    'manifest.json': Buffer.from(
      JSON.stringify({ models: [{ ...model, ...(withGenome ? { genome: genomeFile } : {}) }] }),
    ),
    [`${PACK}.tar.gz`]: readFileSync(join(source, 'pack.tar.gz')),
  };
  const pin = {
    repository: 'fixture/assets',
    tag,
    sha256: Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, sha256(bytes)])),
  };
  const fetchImpl = (url) => {
    const bytes = url.includes(`/${tag}/`) ? assets[url.split('/').at(-1)] : undefined;
    return Promise.resolve(bytes ? new Response(bytes) : new Response(null, { status: 404 }));
  };
  return { pin, fetchImpl };
}

test('reads a bundled mob from two pinned releases, the genome only where the manifest names one', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'skelly-assets-reroll-test-'));
  try {
    const read = (release) => mobBuilds({ ...release, packIds: [PACK], archiveDirectory: join(scratch, 'archives') });
    const before = await read(fixtureRelease(scratch, { tag: 'v0.0.1', glb: 'old', withGenome: false }));
    const after = await read(fixtureRelease(scratch, { tag: 'v0.0.2', glb: 'new', withGenome: true }));
    assert.equal(before.get(`${PACK}/mob`).genome, undefined);
    assert.deepEqual(after.get(`${PACK}/mob`).genome, genome({ girth: 1 }));
    assert.deepEqual(
      mobChanges(before, after).map(({ change, files }) => ({ change, files })),
      [{ change: 'unrecorded', files: ['glb'] }],
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
