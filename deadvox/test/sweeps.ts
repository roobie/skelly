// biome-ignore-all lint/style/noProcessEnv: the sweep gate is env-driven (DEADVOX_SWEEPS)
import process from 'node:process';
import { describe } from 'vitest';

// Seed sweeps stay behind this gate; default tests keep targeted fixed seeds. Unlike gungen's gate it ignores CI,
// because CI's full-suite step has a fixed cap, so the sweep runs as its own CI step instead.
// Wrap the sweep's `it` in `sweepGroup(name, () => { it(...) })`: Biome only recognises `it` itself
// as a test call, so an aliased `it.runIf` would trip noMisplacedAssertion.
export const runSweeps = process.env.DEADVOX_SWEEPS === '1';
export const sweepGroup = describe.runIf(runSweeps);
