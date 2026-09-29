// biome-ignore-all lint/style/noProcessEnv: the sweep gate is env-driven (CI or GUNGEN_SWEEPS)
import process from 'node:process';
import { describe } from 'vitest';

// Generator "solver" tests (random seed sweeps across templates) run only in CI,
// or locally with GUNGEN_SWEEPS=1 (`npm run test:sweeps`). See PROJECT.md, "Generator tests".
// Wrap the sweep's `it` in `sweepGroup(name, () => { it(...) })`: Biome only recognises `it` itself
// as a test call, so an aliased `it.runIf` would trip noMisplacedAssertion.
export const runSweeps = Boolean(process.env.CI) || process.env.GUNGEN_SWEEPS === '1';
export const sweepGroup = describe.runIf(runSweeps);
