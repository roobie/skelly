// biome-ignore-all lint/correctness/noNodejsModules: Build-time dependency check, not game runtime.
// Loading the product's Vite config reads and admits every pack, so this check runs as a plain program rather
// than under Vitest's per-case timer, which a loaded host overruns.
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ENGINE_POLICY, PRESENTATION_POLICY, runtimeClosureViolations } from './runtimeClosure.ts';
import { configFileGateIssues } from './viteResolutionGate.ts';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** @type {ReadonlyArray<readonly [string, import('./runtimeClosure.ts').RuntimeClosurePolicy]>} */
const policies = [
  ['engine', ENGINE_POLICY],
  ['presentation', PRESENTATION_POLICY],
];

/** @param {import('./runtimeClosure.ts').RuntimeClosureViolation} violation */
const edge = ({ importer, specifier, target }) =>
  target === '' || target === specifier ? `${importer} -> ${specifier}` : `${importer} -> ${specifier} (${target})`;

/** @type {string[]} */
const closureFailures = policies.flatMap(([name, policy]) =>
  runtimeClosureViolations(repoRoot, policy).map(
    (violation) => `${name} runtime: ${edge(violation)}: ${violation.reason}`,
  ),
);

// The product's Vite config bundles the runtime package's source, so it must resolve it as the check does.
const viteConfig = join(repoRoot, 'packages/deadvox/vite.config.ts');
/** @type {string[]} */
const gateFailures = (await configFileGateIssues(viteConfig)).map((issue) => `deadvox Vite config, ${issue}`);

const failures = [...closureFailures, ...gateFailures];
if (failures.length === 0) {
  process.stdout.write('Runtime closure passed.\n');
} else {
  process.stderr.write(`Runtime closure failed:\n${failures.map((failure) => `  ${failure}\n`).join('')}`);
  process.exitCode = 1;
}
