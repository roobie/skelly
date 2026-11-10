// biome-ignore-all lint/correctness/noNodejsModules: build-time validation runs in Node.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildRegistry, type ContentSource, requiredContentIssues } from '@skelly/engine/content';
import { admitPacks, type BundleStamp, bundleSourceHash, type PackInput, packContentHash } from '@skelly/engine/packs';
import { admittedSelections } from './readBundledPacks.ts';

export async function stampBundle(sources: readonly ContentSource[], proofHash: string): Promise<BundleStamp> {
  const { registry, issues } = buildRegistry(sources);
  issues.push(...requiredContentIssues(registry));
  if (issues.length > 0) {
    throw new Error(`Bundle validation failed: ${JSON.stringify(issues)}`);
  }
  return { sourceHash: await bundleSourceHash(sources), proofHash };
}

export async function stampPacks(
  inputs: readonly PackInput[],
  proofHash: string,
  entryPack: string,
): Promise<Record<string, BundleStamp>> {
  const selections = admittedSelections(inputs, entryPack);
  await Promise.all(selections.map((packs) => stampBundle(admitPacks(packs).sources, proofHash)));
  return Object.fromEntries(
    await Promise.all(
      [...new Set(selections.flat())].map(async (pack) => [
        pack.manifest.id,
        { sourceHash: await packContentHash(pack), proofHash },
      ]),
    ),
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const { packs, proofHash, entryPack } = JSON.parse(input) as {
    packs: PackInput[];
    proofHash: string;
    entryPack: string;
  };
  process.stdout.write(JSON.stringify(await stampPacks(packs, proofHash, entryPack)));
}
