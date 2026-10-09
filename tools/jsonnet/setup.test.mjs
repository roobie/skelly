import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyArchiveHash } from './setup.mjs';

const WRONG_HASH_MESSAGE = /SHA-256 mismatch/;

test('rejects a local archive fixture when its pinned SHA-256 is wrong', () => {
  assert.throws(() => verifyArchiveHash(Buffer.from('tiny local archive fixture'), '0'.repeat(64)), WRONG_HASH_MESSAGE);
});
