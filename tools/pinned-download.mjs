// Downloads pinned by SHA-256: setup fetches third-party and release bytes that every clone and CI must agree on.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const RETRY_DELAYS_MS = [1000, 4000];

export function verifySha256(bytes, expectedHash, label) {
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expectedHash}, received ${actualHash}`);
  }
}

/**
 * The bytes at `url`, retried on network errors and server errors, because one transient hosting failure would
 * otherwise fail a whole CI job. `fetchImpl` is injectable so tests need no network.
 */
export async function download(url, label, { fetchImpl = fetch } = {}) {
  let lastFailure = 'no attempt made';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    let retryable = true;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a retry waits for the attempt before it.
      const response = await fetchImpl(url);
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
      lastFailure = `${response.status} ${response.statusText}`.trim();
      retryable = response.status >= 500;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (!retryable) {
      break;
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw new Error(`${label} download failed: ${url} (${lastFailure})`);
}

/** Unpacks a verified `.tar.gz` (only `members`, when given) into a new temporary directory the caller removes. */
export function extractTarGz(archive, members = []) {
  const directory = mkdtempSync(join(tmpdir(), 'skelly-pinned-'));
  const archivePath = join(directory, 'archive.tar.gz');
  const unpacked = join(directory, 'unpacked');
  writeFileSync(archivePath, archive);
  mkdirSync(unpacked);
  try {
    execFileSync('tar', ['-xzf', archivePath, '-C', unpacked, ...members], { stdio: 'inherit' });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  rmSync(archivePath);
  return { directory, unpacked };
}
