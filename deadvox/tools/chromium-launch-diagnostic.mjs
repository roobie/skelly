// Temporary branch-only comparison for issue #287; this is not a browser stage.
// biome-ignore-all lint/correctness/noNodejsModules: diagnostic launches Playwright browsers on CI
// biome-ignore-all lint/suspicious/noConsole: diagnostic evidence is emitted as structured log lines
// biome-ignore-all lint/style/noProcessEnv: the system-browser path and D-Bus environment are the subject of the comparison

import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import {
  chromiumExecutableInfo,
  flushChromiumDebugOutput,
  launchChromium,
  loadPlaywright,
} from '../test/browser/chromium.mjs';
import { browserStageArgs } from '../test/browser/stage-mode.mjs';

const resolveExecutable = (command) => {
  if (isAbsolute(command) || command.includes('/')) {
    return resolve(command);
  }
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = resolve(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch (error) {
      if (!['EACCES', 'ENOENT', 'ENOTDIR'].includes(error.code)) {
        throw error;
      }
    }
  }
  return command;
};

const { chromium } = await loadPlaywright();
const managed = chromiumExecutableInfo(chromium.executablePath());
const system = chromiumExecutableInfo(resolveExecutable(process.env.CHROME_BIN ?? 'google-chrome'));
const args = browserStageArgs('ui-browser-contract', [
  '--disable-extensions',
  '--password-store=basic',
  '--window-size=1280,900',
]);
const results = [];

const probe = async (source, executable, launch) => {
  process.stdout.write(
    `CHROMIUM_LAUNCH_PROBE_START ${JSON.stringify({
      source,
      ...executable,
      DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? null,
    })}\n`,
  );
  const started = performance.now();
  let browser;
  let browserVersion;
  let outcome;
  let error;
  try {
    browser = await launch();
    browserVersion = browser.version();
    outcome = 'launched';
  } catch (caught) {
    outcome = 'launch-failed';
    error = String(caught);
  }
  const launchMs = Math.round(performance.now() - started);
  let closeError;
  if (browser) {
    try {
      await browser.close();
    } catch (caught) {
      closeError = String(caught);
    }
  }
  flushChromiumDebugOutput();
  const result = {
    source,
    ...executable,
    outcome,
    launchMs,
    browserVersion,
    closeError,
    error,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? null,
  };
  results.push(result);
  process.stdout.write(`CHROMIUM_LAUNCH_PROBE_RESULT ${JSON.stringify(result)}\n`);
};

await probe('playwright-managed', managed, () =>
  launchChromium('ui-browser-contract', {
    headless: true,
    args: ['--disable-extensions', '--password-store=basic', '--window-size=1280,900'],
    timeout: 30_000,
  }),
);
await probe('runner-system-chrome', system, () =>
  chromium.launch({
    executablePath: system.executablePath,
    headless: true,
    args,
    timeout: 30_000,
  }),
);
process.stdout.write(`CHROMIUM_LAUNCH_COMPARISON ${JSON.stringify(results)}\n`);
