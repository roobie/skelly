// biome-ignore-all lint/style/noProcessEnv: runner debug and D-Bus state belong in launch diagnostics
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { bufferPlaywrightDebugOutput } from './playwrightDebugBuffer.mjs';
import { browserStageArgs } from './stage-mode.mjs';

const debugChannels = new Set((process.env.DEBUG ?? '').split(/[\s,]+/).filter(Boolean));
debugChannels.add('pw:browser');
process.env.DEBUG = [...debugChannels].join(',');

const { chromium, firefox } = await import('playwright');
const playwright = { chromium, firefox };
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const debugOutput = bufferPlaywrightDebugOutput(originalStderrWrite);
process.stderr.write = debugOutput.write;
let failed = false;
process.once('uncaughtExceptionMonitor', () => {
  failed = true;
});
process.once('exit', () => {
  if (failed || (process.exitCode !== undefined && process.exitCode !== 0)) {
    debugOutput.flush();
  } else {
    debugOutput.discard();
  }
  process.stderr.write = originalStderrWrite;
});

export const loadPlaywright = () => playwright;

export function chromiumExecutableInfo(executablePath) {
  try {
    const version = execFileSync(executablePath, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    return { executablePath, version: version || 'unavailable: empty --version output' };
  } catch (error) {
    return { executablePath, version: `unavailable: ${error.message}` };
  }
}

export function flushChromiumDebugOutput() {
  debugOutput.flush();
}

export async function launchChromium(stage, options = {}) {
  const { args, renderMode, ...launchOptions } = options;
  const executablePath = chromium.executablePath();
  const executable = chromiumExecutableInfo(executablePath);
  try {
    return await chromium.launch({
      ...launchOptions,
      args: browserStageArgs(stage, args, renderMode),
    });
  } catch (error) {
    originalStderrWrite(
      `CHROMIUM_LAUNCH_FAILURE ${JSON.stringify({
        stage,
        source: 'playwright-managed',
        ...executable,
        DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? null,
        error: String(error),
      })}\n`,
    );
    debugOutput.flush();
    throw error;
  }
}
