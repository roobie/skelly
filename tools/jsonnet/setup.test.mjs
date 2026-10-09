import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installJsonnetArchive } from './setup.mjs';

const HASH_MISMATCH = /go-jsonnet archive SHA-256 mismatch/;

test('refuses a wrong-hash archive before installing into the target directory', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'jsonnet-setup-test-'));
  const targetDirectory = join(temporaryDirectory, 'install');
  try {
    assert.throws(
      () => installJsonnetArchive(Buffer.from('tiny local archive fixture'), '0'.repeat(64), targetDirectory),
      HASH_MISMATCH,
    );
    assert.equal(existsSync(targetDirectory), false);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
