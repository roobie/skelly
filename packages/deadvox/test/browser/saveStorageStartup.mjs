// Startup waits for the save-storage browser stages: which operations are bounded as server readiness and
// which are compile work that only reports its duration. The production-bundle build is deterministic
// compile work whose duration tracks runner speed, so it never sits inside a readiness bound — racing it
// against one failed CI on runner variance alone while the build ran normally (#1691). The enclosing
// workflow step bounds a hung build. The boundaries are pinned deterministically by
// `packages/deadvox/test/saveStorageStartup.test.ts`, "save-storage stage startup bounds", which controls
// the Vite operations and the timer scheduler instead of running a build or waiting on the clock.
// The stage script injects the real Vite operations; a test injects controlled ones.
import process from 'node:process';
export const createSaveStorageStartup = ({
  browserName,
  productionBundleStage,
  stageId,
  build,
  preview,
  devServer,
  timeoutMs,
  now = () => performance.now(),
  schedule = (fire, ms) => globalThis.setTimeout(fire, ms),
  cancel = (timer) => globalThis.clearTimeout(timer),
  write = (line) => process.stdout.write(line),
  writeError = (line) => process.stderr.write(line),
}) => {
  const withTimeout = async (label, task, boundMs = timeoutMs) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = schedule(() => reject(new Error(`${label} timed out after ${boundMs} ms`)), boundMs);
    });
    try {
      return await Promise.race([task, timeout]);
    } finally {
      cancel(timer);
    }
  };
  const navigationPhaseLog = async (label, action) => {
    const startedRealMs = now();
    write(`SAVE_NAV_PHASE ${JSON.stringify({ label, event: 'start', at: Date.now() })}\n`);
    try {
      const result = await action();
      write(
        `SAVE_NAV_PHASE ${JSON.stringify({ label, event: 'end', elapsedRealMs: now() - startedRealMs, at: Date.now() })}\n`,
      );
      return result;
    } catch (error) {
      writeError(
        `SAVE_NAV_PHASE ${JSON.stringify({ label, event: 'error', elapsedRealMs: now() - startedRealMs, at: Date.now(), error: String(error) })}\n`,
      );
      throw error;
    }
  };
  // Every navigation phase is bounded except the Vite startup phase, which spans the production build.
  const navigationPhase = (label, action) => navigationPhaseLog(label, () => withTimeout(label, action()));
  const startWebServer = async () => {
    if (productionBundleStage) {
      const buildStartedMs = now();
      write(`${browserName}: building production bundle for pixel stage ${stageId}\n`);
      await build();
      write(`${browserName}: production bundle built in ${Math.round(now() - buildStartedMs)} ms\n`);
      return await withTimeout('Vite preview startup', preview());
    }
    return await devServer();
  };
  const startStageServer = () =>
    productionBundleStage ? startWebServer() : withTimeout('Vite startup', startWebServer());
  return { navigationPhase, navigationPhaseLog, startStageServer, withTimeout };
};
