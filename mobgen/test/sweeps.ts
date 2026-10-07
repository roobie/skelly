// biome-ignore-all lint/style/noProcessEnv: seed sweeps require an explicit opt-in.
import process from 'node:process';
import { describe } from 'vitest';

export const runSweeps = process.env.MOBGEN_SWEEPS === '1';
export const sweepGroup = describe.runIf(runSweeps);
