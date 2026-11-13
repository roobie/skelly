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
  return { assets, pin, fetchImpl };
}

function withScratch(run) {
  const scratch = mkdtempSync(join(tmpdir(), 'skelly-assets-setup-test-'));
  return Promise.resolve(run(scratch)).finally(() => rmSync(scratch, { recursive: true, force: true }));
}

/** Serves the fixture release while recording which asset names were fetched, so a test can pin the network use. */
function trackingFetch(fetchImpl, fetched) {
  return (url) => {
    fetched.push(url.split('/').at(-1));
    return fetchImpl(url);
  };
}

test('installs each pack at its pack directory and replaces what an earlier install left there', () =>
  withScratch(async (scratch) => {
    const { pin, fetchImpl } = fixtureRelease(scratch);
    const builtDirectory = join(scratch, 'built');
    mkdirSync(join(builtDirectory, PACK), { recursive: true });
    writeFileSync(join(builtDirectory, PACK, 'stale.glb'), 'from an older release');

    await installRelease({
      pin,
      packIds: [PACK],
      builtDirectory,
      stampPath: join(scratch, 'stamp.json'),
      archiveDirectory: join(scratch, 'archives'),
      fetchImpl,
    });

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
      installRelease({
        pin,
        packIds: [PACK],
        builtDirectory,
        stampPath: join(scratch, 'stamp.json'),
        archiveDirectory: join(scratch, 'archives'),
        fetchImpl,
      }),
      HASH_MISMATCH,
    );
    assert.equal(readFileSync(join(builtDirectory, PACK, 'kept.glb'), 'utf8'), 'earlier install');
    assert.equal(existsSync(join(builtDirectory, 'manifest.json')), false);
  }));

test('rejects a truncated cached archive and recovers it by download', () =>
  withScratch(async (scratch) => {
    const { assets, pin, fetchImpl } = fixtureRelease(scratch);
    const fetched = [];
    const archiveDirectory = join(scratch, 'archives');
    mkdirSync(archiveDirectory);
    writeFileSync(join(archiveDirectory, 'manifest.json'), assets['manifest.json']);
    writeFileSync(join(archiveDirectory, `${PACK}.tar.gz`), assets[`${PACK}.tar.gz`].subarray(0, -3));

    await installRelease({
      pin,
      packIds: [PACK],
      builtDirectory: join(scratch, 'built'),
      stampPath: join(scratch, 'stamp.json'),
      archiveDirectory,
      fetchImpl: trackingFetch(fetchImpl, fetched),
    });

    assert.deepEqual(fetched, [`${PACK}.tar.gz`], 'only the corrupted cache entry downloads');
    assert.equal(
      readFileSync(join(archiveDirectory, `${PACK}.tar.gz`)).equals(assets[`${PACK}.tar.gz`]),
      true,
      'the repaired archive replaces the corrupted cache entry',
    );
    assert.equal(readFileSync(join(scratch, 'built', PACK, 'assets/model.glb'), 'utf8'), 'model bytes');
  }));

test('re-extracts from verified archives, so corrupted installed files never survive setup', () =>
  withScratch(async (scratch) => {
    const { assets, pin, fetchImpl } = fixtureRelease(scratch);
    const fetched = [];
    const archiveDirectory = join(scratch, 'archives');
    mkdirSync(archiveDirectory);
    for (const [name, bytes] of Object.entries(assets)) {
      writeFileSync(join(archiveDirectory, name), bytes);
    }
    const builtDirectory = join(scratch, 'built');
    mkdirSync(join(builtDirectory, PACK, 'assets'), { recursive: true });
    writeFileSync(join(builtDirectory, 'manifest.json'), 'corrupted manifest');
    writeFileSync(join(builtDirectory, PACK, 'assets', 'model.glb'), 'corrupted model');
    const stamp = {
      tag: pin.tag,
      sha256: { 'manifest.json': pin.sha256['manifest.json'], [`${PACK}.tar.gz`]: pin.sha256[`${PACK}.tar.gz`] },
    };
    writeFileSync(join(scratch, 'stamp.json'), JSON.stringify(stamp));

    await installRelease({
      pin,
      packIds: [PACK],
      builtDirectory,
      stampPath: join(scratch, 'stamp.json'),
      archiveDirectory,
      fetchImpl: trackingFetch(fetchImpl, fetched),
    });

    assert.deepEqual(fetched, [], 'a fully valid archive cache needs no download');
    assert.equal(readFileSync(join(builtDirectory, 'manifest.json'), 'utf8'), '{"packs":{}}');
    assert.equal(readFileSync(join(builtDirectory, PACK, 'assets/model.glb'), 'utf8'), 'model bytes');
  }));
