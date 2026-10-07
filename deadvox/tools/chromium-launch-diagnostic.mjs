// Temporary branch-only covering-array diagnostic for issue #287; this is not a browser stage.
// biome-ignore-all lint/correctness/noNodejsModules: diagnostic launches Playwright browsers on CI
// biome-ignore-all lint/suspicious/noConsole: diagnostic evidence is emitted as structured log lines
// biome-ignore-all lint/style/noProcessEnv: browser-source and D-Bus environment are diagnostic factors

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createInterface } from 'node:readline';
import {
  chromiumExecutableInfo,
  flushChromiumDebugOutput,
  launchChromium,
  loadPlaywright,
} from '../test/browser/chromium.mjs';
import { browserStageArgs } from '../test/browser/stage-mode.mjs';

const samplesPerCell = 20;

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

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const privateBus = async () => {
  const child = spawn('dbus-daemon', ['--session', '--nofork', '--print-address=1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-2000);
  });

  let address;
  try {
    address = await new Promise((resolveAddress, rejectAddress) => {
      const lines = createInterface({ input: child.stdout });
      const finish = (error, value) => {
        clearTimeout(timer);
        lines.close();
        child.off('error', onError);
        child.off('exit', onExit);
        if (error) {
          rejectAddress(error);
        } else {
          resolveAddress(value);
        }
      };
      const onError = (error) => finish(error);
      const onExit = (code, signal) => finish(new Error(`exited before address (code=${code}, signal=${signal})`));
      const timer = setTimeout(() => finish(new Error('timed out waiting for session address')), 5000);
      lines.once('line', (line) => finish(null, line));
      child.once('error', onError);
      child.once('exit', onExit);
    });
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`could not start private dbus-daemon session: ${error.message}; ${stderr}`, { cause: error });
  }
  if (!address) {
    child.kill('SIGTERM');
    throw new Error('dbus-daemon reported an empty private session address');
  }

  return {
    address,
    close: async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
};

const { chromium } = await loadPlaywright();
const managed = chromiumExecutableInfo(chromium.executablePath());
const system = chromiumExecutableInfo(resolveExecutable(process.env.CHROME_BIN ?? 'google-chrome'));
const args = browserStageArgs('ui-browser-contract', [
  '--disable-extensions',
  '--password-store=basic',
  '--window-size=1280,900',
]);
const sources = [
  {
    name: 'playwright-managed',
    executable: managed,
    launch: () =>
      launchChromium('ui-browser-contract', {
        headless: true,
        args: ['--disable-extensions', '--password-store=basic', '--window-size=1280,900'],
        timeout: 30_000,
      }),
  },
  {
    name: 'runner-system-chrome',
    executable: system,
    launch: () =>
      chromium.launch({
        executablePath: system.executablePath,
        headless: true,
        args,
        timeout: 30_000,
      }),
  },
];
const bus = await privateBus();
const buses = [
  { name: 'unset', address: null },
  { name: 'disabled', address: 'disabled:' },
  { name: 'private-session', address: bus.address },
];
const observations = new Map();
for (const source of sources) {
  for (const busCondition of buses) {
    observations.set(`${source.name}/${busCondition.name}`, []);
  }
}

const probe = async (source, busCondition, iteration) => {
  if (busCondition.address === null) {
    delete process.env.DBUS_SESSION_BUS_ADDRESS;
  } else {
    process.env.DBUS_SESSION_BUS_ADDRESS = busCondition.address;
  }

  const started = performance.now();
  let browser;
  let browserVersion;
  let outcome;
  let error;
  try {
    browser = await source.launch();
    browserVersion = browser.version();
    outcome = 'launched';
  } catch (caught) {
    outcome = 'launch-failed';
    error = String(caught);
    flushChromiumDebugOutput();
  }
  const launchMs = Math.round(performance.now() - started);
  let closeError;
  if (browser) {
    try {
      await browser.close();
    } catch (caught) {
      closeError = String(caught);
      flushChromiumDebugOutput();
    }
  }
  const observation = {
    source: source.name,
    browserVersion,
    bus: busCondition.name,
    DBUS_SESSION_BUS_ADDRESS: busCondition.address,
    iteration,
    launchMs,
    outcome,
    closeError,
    error,
  };
  observations.get(`${source.name}/${busCondition.name}`).push(observation);
  process.stdout.write(`CHROMIUM_LAUNCH_TRIAL ${JSON.stringify(observation)}\n`);
};

try {
  process.stdout.write(
    `CHROMIUM_LAUNCH_DIAGNOSTIC_START ${JSON.stringify({
      samplesPerCell,
      sources: sources.map(({ name, executable }) => ({ source: name, ...executable })),
      buses: buses.map(({ name, address }) => ({ bus: name, DBUS_SESSION_BUS_ADDRESS: address })),
      timeoutMs: 30_000,
    })}\n`,
  );

  for (let iteration = 1; iteration <= samplesPerCell; iteration += 1) {
    // Start system Chrome's first sample on the private bus; the previous run's sole tail was its first system launch under unset bus.
    const busOffset = (iteration + 1) % buses.length;
    const orderedBuses = [...buses.slice(busOffset), ...buses.slice(0, busOffset)];
    const orderedSources = iteration % 2 === 0 ? [...sources].reverse() : sources;
    for (const busCondition of orderedBuses) {
      for (const source of orderedSources) {
        // biome-ignore lint/performance/noAwaitInLoops: serialize launch and close for independent timing samples
        await probe(source, busCondition, iteration);
      }
    }
  }

  const summaries = [];
  for (const source of sources) {
    for (const busCondition of buses) {
      const trials = observations.get(`${source.name}/${busCondition.name}`);
      const durations = trials.map(({ launchMs }) => launchMs);
      const failures = trials.filter(
        ({ outcome, closeError }) => outcome !== 'launched' || closeError !== undefined,
      ).length;
      const over10Seconds = trials.filter(({ launchMs }) => launchMs > 10_000).length;
      const summary = {
        source: source.name,
        browserVersion: source.executable.version,
        bus: busCondition.name,
        samples: trials.length,
        medianLaunchMs: median(durations),
        maxLaunchMs: Math.max(...durations),
        failureCount: failures,
        over10Seconds: source.name === 'runner-system-chrome' ? over10Seconds : undefined,
      };
      summaries.push(summary);
      process.stdout.write(`CHROMIUM_LAUNCH_CELL_SUMMARY ${JSON.stringify(summary)}\n`);
    }
  }

  const systemTrials = summaries.filter(({ source }) => source === 'runner-system-chrome');
  process.stdout.write(
    `CHROMIUM_LAUNCH_DIAGNOSTIC_RESULT ${JSON.stringify({
      samplesPerCell,
      cells: summaries,
      systemChromeOver10Seconds: systemTrials.reduce((sum, { over10Seconds }) => sum + over10Seconds, 0),
      systemChromeSamples: systemTrials.reduce((sum, { samples }) => sum + samples, 0),
    })}\n`,
  );
} finally {
  delete process.env.DBUS_SESSION_BUS_ADDRESS;
  await bus.close();
}
