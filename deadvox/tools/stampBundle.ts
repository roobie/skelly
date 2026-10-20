// biome-ignore-all lint/correctness/noNodejsModules: build-time validation runs in Node.
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { type BundleStamp, bundleSourceHash } from '../src/core/bundleAdmission.ts';
import { buildRegistry, type ContentSource, requiredContentIssues } from '../src/core/content.ts';

export async function stampBundle(sources: readonly ContentSource[], proofHash: string): Promise<BundleStamp> {
  const { registry, issues } = buildRegistry(sources);
  issues.push(...requiredContentIssues(registry));
  if (issues.length > 0) {
    throw new Error(`Bundle validation failed: ${JSON.stringify(issues)}`);
  }
  return { sourceHash: await bundleSourceHash(sources), proofHash };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const { sources, proofHash } = JSON.parse(input) as {
    sources: ContentSource[];
    proofHash: string;
  };
  process.stdout.write(JSON.stringify(await stampBundle(sources, proofHash)));
}
