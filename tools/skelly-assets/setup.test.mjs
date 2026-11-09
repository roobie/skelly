import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installRelease } from './setup.mjs';

const PACK = 'fixture.pack';
const HASH_MISMATCH = /SHA-256 mismatch/;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A release of one pack archive holding `<pack>/assets/model.glb`, served from memory instead of GitHub. */
function fixtureRelease(scratch) {
  const source = join(scratch, 'source');
  mkdirSync(join(source, PACK, 'assets'), { recursive: true });
  writeFileSync(join(source, PACK, 'assets/model.glb'), 'model bytes');
  execFileSync('tar', ['-czf', join(scratch, 'pack.tar.gz'), '-C', source, PACK]);
  const assets = {
    'manifest.json': Buffer.from('{"packs":{}}'),
    [`${PACK}.tar.gz`]: readFileSync(join(scratch, 'pack.tar.gz')),
  };
  const pin = {
    repository: 'fixture/assets',
    tag: 'v0.0.1',
    sha256: Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, sha256(bytes)])),
  };
  const fetchImpl = (url) => {
    const bytes = assets[url.split('/').at(-1)];
    return Promise.resolve(bytes ? new Response(bytes) : new Response(null, { status: 404 }));
  };
  return { pin, fetchImpl };
}

function withScratch(run) {
  const scratch = mkdtempSync(join(tmpdir(), 'skelly-assets-setup-test-'));
  return Promise.resolve(run(scratch)).finally(() => rmSync(scratch, { recursive: true, force: true }));
}

test('installs each pack at its pack directory and replaces what an earlier install left there', () =>
  withScratch(async (scratch) => {
    const { pin, fetchImpl } = fixtureRelease(scratch);
    const builtDirectory = join(scratch, 'built');
    mkdirSync(join(builtDirectory, PACK), { recursive: true });
    writeFileSync(join(builtDirectory, PACK, 'stale.glb'), 'from an older release');

    await installRelease({ pin, packIds: [PACK], builtDirectory, stampPath: join(scratch, 'stamp.json'), fetchImpl });

    assert.equal(readFileSync(join(builtDirectory, PACK, 'assets/model.glb'), 'utf8'), 'model bytes');
    assert.equal(existsSync(join(builtDirectory, PACK, 'stale.glb')), false);
    assert.equal(existsSync(join(builtDirectory, 'manifest.json')), true);
  }));

test('refuses an asset whose bytes differ from the pin and leaves the earlier install untouched', () =>
  withScratch(async (scratch) => {
    const { pin, fetchImpl } = fixtureRelease(scratch);
    pin.sha256[`${PACK}.tar.gz`] = '0'.repeat(64);
    const builtDirectory = join(scratch, 'built');
    mkdirSync(join(builtDirectory, PACK), { recursive: true });
    writeFileSync(join(builtDirectory, PACK, 'kept.glb'), 'earlier install');

    await assert.rejects(
      installRelease({ pin, packIds: [PACK], builtDirectory, stampPath: join(scratch, 'stamp.json'), fetchImpl }),
      HASH_MISMATCH,
    );
    assert.equal(readFileSync(join(builtDirectory, PACK, 'kept.glb'), 'utf8'), 'earlier install');
    assert.equal(existsSync(join(builtDirectory, 'manifest.json')), false);
  }));
