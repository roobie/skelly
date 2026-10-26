// biome-ignore-all lint/style/noProcessEnv: the sweep gate is env-driven (GUNGEN_SWEEPS)
import process from 'node:process';
import { describe } from 'vitest';

// Exhaustive generation sweeps run only under GUNGEN_SWEEPS, in the manual slow-test workflow;
// `AGENTS.md`, "Tests" says why. Default tests exercise representative properties.
// Wrap the sweep's `it` in `sweepGroup(name, () => { it(...) })`: Biome only recognises `it` itself
// as a test call, so an aliased `it.runIf` would trip noMisplacedAssertion.
export const runSweeps = process.env.GUNGEN_SWEEPS === '1';
export const sweepGroup = describe.runIf(runSweeps);
