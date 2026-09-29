// biome-ignore-all lint/style/noProcessEnv: seed sweeps are opt-in locally and enabled in CI.
import process from 'node:process';
import { describe } from 'vitest';

export const runSweeps = Boolean(process.env.CI) || process.env.MOBGEN_SWEEPS === '1';
export const sweepGroup = describe.runIf(runSweeps);
