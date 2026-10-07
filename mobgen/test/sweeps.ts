// biome-ignore-all lint/style/noProcessEnv: broad seed sweeps are for CI and explicit local runs.
import process from 'node:process';
import { describe } from 'vitest';

export const runSweeps = Boolean(process.env.CI) || process.env.MOBGEN_SWEEPS === '1';
export const sweepGroup = describe.runIf(runSweeps);
