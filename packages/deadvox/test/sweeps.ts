// biome-ignore-all lint/style/noProcessEnv: the slow-test gate is env-driven (DEADVOX_SWEEPS)
import process from 'node:process';
import { describe } from 'vitest';

// Cases that build whole worlds, city plans or scenario walks, and seed sweeps, stay behind this gate; they run in
// the manual slow-test workflow, not per change. Whole slow files are gated in vite.config.ts, `SLOW_TEST_FILES`.
// Wrap the case's `it` in `sweepGroup(name, () => { it(...) })`: Biome only recognises `it` itself
// as a test call, so an aliased `it.runIf` would trip noMisplacedAssertion.
export const runSweeps = process.env.DEADVOX_SWEEPS === '1';
export const sweepGroup = describe.runIf(runSweeps);
