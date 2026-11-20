// biome-ignore-all lint/correctness/noNodejsModules: build-time validation runs in Node.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildRegistry, type ContentSource, requiredContentIssues } from '@skelly/engine/content';
import { admitPacks, type BundleStamp, bundleSourceHash, type PackInput, packContentHash } from '@skelly/engine/packs';
import { admittedSelections } from './readBundledPacks.ts';

const assertValidBundle = (sources: readonly ContentSource[]): void => {
  const { registry, issues } = buildRegistry(sources);
  issues.push(...requiredContentIssues(registry));
  if (issues.length > 0) {
    throw new Error(`Bundle validation failed: ${JSON.stringify(issues)}`);
  }
};

export async function stampBundle(sources: readonly ContentSource[], proofHash: string): Promise<BundleStamp> {
  assertValidBundle(sources);
  return { sourceHash: await bundleSourceHash(sources), proofHash };
}

/** Validates every `count`th selection from `index`, so shards split the selections without coordinating. */
const validateSelections = (selections: readonly PackInput[][], { index, count } = { index: 0, count: 1 }): void => {
  for (const [position, packs] of selections.entries()) {
    if (position % count === index) {
      assertValidBundle(admitPacks(packs).sources);
    }
  }
};

const packStamps = async (
  selections: readonly PackInput[][],
  proofHash: string,
): Promise<Record<string, BundleStamp>> =>
  Object.fromEntries(
    await Promise.all(
      [...new Set(selections.flat())].map(async (pack) => [
        pack.manifest.id,
        { sourceHash: await packContentHash(pack), proofHash },
      ]),
    ),
  );

export function stampPacks(
  inputs: readonly PackInput[],
  proofHash: string,
  entryPack: string,
): Promise<Record<string, BundleStamp>> {
  const selections = admittedSelections(inputs, entryPack);
  validateSelections(selections);
  return packStamps(selections, proofHash);
}

interface StampRequest {
  packs: PackInput[];
  proofHash: string;
  entryPack: string;
}

/**
 * Each opt-in selection costs about a whole default validation, and they grow with every opt-in pack, so the command
 * line validates them in parallel shard processes. Each shard holds a whole registry, so the shard count bounds the
 * build's memory as well as its time.
 */
const MAX_VALIDATION_SHARDS = 4;
const SHARD_FLAG = '--shard';

const runShard = (input: string, index: number, count: number): Promise<number> =>
  new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [...process.execArgv, fileURLToPath(import.meta.url), SHARD_FLAG, `${index}/${count}`],
      { stdio: ['pipe', 'ignore', 'inherit'] },
    );
    child.on('error', fail);
    child.on('close', (code) => done(code ?? 1));
    child.stdin.end(input);
  });

const stampInShards = async (input: string): Promise<Record<string, BundleStamp>> => {
  const { packs, proofHash, entryPack } = JSON.parse(input) as StampRequest;
  const selections = admittedSelections(packs, entryPack);
  const count = Math.min(availableParallelism(), MAX_VALIDATION_SHARDS, selections.length);
  const statuses = await Promise.all(Array.from({ length: count }, (_, index) => runShard(input, index, count)));
  if (statuses.some((status) => status !== 0)) {
    throw new Error('Bundle validation failed in a shard; its error is above');
  }
  return packStamps(selections, proofHash);
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const [flag, shard] = process.argv.slice(2);
  if (flag === SHARD_FLAG && shard) {
    const { packs, entryPack } = JSON.parse(input) as StampRequest;
    const [index, count] = shard.split('/').map(Number) as [number, number];
    validateSelections(admittedSelections(packs, entryPack), { index, count });
  } else {
    process.stdout.write(JSON.stringify(await stampInShards(input)));
  }
}
