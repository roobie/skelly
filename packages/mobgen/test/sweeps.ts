// biome-ignore-all lint/style/noProcessEnv: the sweep gate is env-driven (MOBGEN_SWEEPS)
import process from 'node:process';
import { describe } from 'vitest';

// Population and seed sweeps run only under MOBGEN_SWEEPS, in the manual slow-test workflow;
// `AGENTS.md`, "Tests" says why. Default tests exercise representative properties.
export const runSweeps = process.env.MOBGEN_SWEEPS === '1';
export const sweepGroup = describe.runIf(runSweeps);
