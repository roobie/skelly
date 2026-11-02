// biome-ignore-all lint/correctness/noNodejsModules: build-time validation runs in Node.
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { type BundleStamp, bundleSourceHash } from '../src/core/bundleAdmission.ts';
import { buildRegistry, type ContentSource, requiredContentIssues } from '../src/core/content.ts';
import { admitPacks, type PackInput, packContentHash } from '../src/core/packAdmission.ts';

export async function stampBundle(sources: readonly ContentSource[], proofHash: string): Promise<BundleStamp> {
  const { registry, issues } = buildRegistry(sources);
  issues.push(...requiredContentIssues(registry));
  if (issues.length > 0) {
    throw new Error(`Bundle validation failed: ${JSON.stringify(issues)}`);
  }
  return { sourceHash: await bundleSourceHash(sources), proofHash };
}

async function stampPacks(inputs: readonly PackInput[], proofHash: string): Promise<Record<string, BundleStamp>> {
  const admitted = admitPacks(inputs);
  if (admitted.issues.length > 0) {
    throw new Error(`Pack admission failed: ${JSON.stringify(admitted.issues)}`);
  }
  await stampBundle(admitted.sources, proofHash);
  return Object.fromEntries(
    await Promise.all(
      admitted.packs.map(async (pack) => [pack.manifest.id, { sourceHash: await packContentHash(pack), proofHash }]),
    ),
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const { packs, proofHash } = JSON.parse(input) as { packs: PackInput[]; proofHash: string };
  process.stdout.write(JSON.stringify(await stampPacks(packs, proofHash)));
}
