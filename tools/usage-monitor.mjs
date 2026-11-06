// Prints one line whenever the weekly "% left" in a tmux pane's status line changes, with the burn trend and
// the projected % left at the reset.
// Usage: node tools/usage-monitor.mjs --pane id --log file.jsonl [--every seconds] [--window minutes] [--once]
// The log keeps the trend across restarts, so it belongs outside the checkout's tracked files.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, truncateSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    log: { type: 'string' },
    pane: { type: 'string' },
    every: { type: 'string', default: '60' },
    window: { type: 'string', default: '60' },
    once: { type: 'boolean', default: false },
  },
});
if (!(values.log && values.pane)) {
  throw new Error('name a --pane and a --log file');
}
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_UNIT = { d: 1440, h: MINUTES_PER_HOUR, m: 1 };
const MIN_EVERY_SECONDS = 1;
// Node turns a longer timer delay into 1 ms, the same tmux-spawning loop as a bad value.
const MAX_EVERY_SECONDS = 2_147_483;

function positiveOption(name) {
  const value = Number(values[name]);
  if (!(Number.isFinite(value) && value > 0)) {
    throw new Error(`--${name} must be a positive number, not "${values[name]}"`);
  }
  return value;
}
const windowMinutes = positiveOption('window');
const everySeconds = positiveOption('every');
if (everySeconds < MIN_EVERY_SECONDS || everySeconds > MAX_EVERY_SECONDS) {
  throw new Error(`--every must be from ${MIN_EVERY_SECONDS} to ${MAX_EVERY_SECONDS} seconds`);
}

// Status line form: "wk 17% left (7h2m)"; the reset may also read "2d3h" or "45m".
function read() {
  const text = execFileSync('tmux', ['capture-pane', '-p', '-t', values.pane], { encoding: 'utf8' });
  const match = [...text.matchAll(/wk (\d+)% left \(((?:\d+[dhm])+)\)/g)].at(-1);
  if (!match) {
    return null;
  }
  const minutes = [...match[2].matchAll(/(\d+)([dhm])/g)].reduce(
    (sum, [, n, unit]) => sum + n * MINUTES_PER_UNIT[unit],
    0,
  );
  return { pct: Number(match[1]), resetMinutes: minutes };
}

// Byte offset of a torn final line, cut before the next append: left in place, the append would bury it mid-log, where
// a bad line stops the monitor.
let tornAt = null;

function loadLog() {
  if (!existsSync(values.log)) {
    return [];
  }
  const text = readFileSync(values.log, 'utf8');
  const lines = text.split('\n');
  const finalIndex = lines.findLastIndex(Boolean);
  const entries = [];
  lines.forEach((line, index) => {
    if (!line) {
      return;
    }
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      if (index !== finalIndex) {
        throw new Error(`${values.log} line ${index + 1} is not JSON: ${line}`, { cause: error });
      }
      process.stderr.write(`monitor: skipping a torn final line in ${values.log}: ${line}\n`);
      tornAt = Buffer.byteLength(text.slice(0, text.lastIndexOf(line)));
    }
  });
  return entries;
}

// A rise means the weekly window reset, so the log's earlier week no longer applies.
function sinceLastRise(entries) {
  const riseAt = entries.findLastIndex((entry, index) => index > 0 && entry.pct > entries[index - 1].pct);
  return entries.slice(Math.max(riseAt, 0));
}

const changes = sinceLastRise(loadLog());

// A rate between change points avoids the sawtooth of an integer reading: time since the last change is unknown
// progress within the current percent, not a slowdown.
function ratePerHour(points) {
  if (points.length < 2) {
    return null;
  }
  const hours = (points.at(-1).t - points[0].t) / (MINUTES_PER_HOUR * MS_PER_MINUTE);
  return hours > 0 ? (points[0].pct - points.at(-1).pct) / hours : null;
}

const duration = (minutes) =>
  `${Math.floor(minutes / MINUTES_PER_HOUR)}h${String(Math.round(minutes % MINUTES_PER_HOUR)).padStart(2, '0')}m`;
const project = (reading, rate) =>
  rate === null ? 'n/a' : `${(reading.pct - rate * (reading.resetMinutes / MINUTES_PER_HOUR)).toFixed(1)}%`;
const showRate = (rate) => (rate === null ? 'n/a' : `${rate.toFixed(2)}%/h`);

function report(now, reading) {
  const rateRecent = ratePerHour(changes.filter((change) => now - change.t <= windowMinutes * MS_PER_MINUTE));
  const rateAll = ratePerHour(changes);
  const needed = reading.resetMinutes > 0 ? reading.pct / (reading.resetMinutes / MINUTES_PER_HOUR) : 0;
  const clock = new Date(now).toTimeString().slice(0, 5);
  process.stdout.write(
    `${clock} wk ${reading.pct}% left, reset in ${duration(reading.resetMinutes)} | ` +
      `burn last ${windowMinutes}m ${showRate(rateRecent)}, all ${showRate(rateAll)} | ` +
      `at reset: ${project(reading, rateRecent)} on recent, ${project(reading, rateAll)} on all | ` +
      `0% needs ${needed.toFixed(2)}%/h\n`,
  );
}

function fail(message) {
  process.stderr.write(`monitor: ${message}\n`);
  if (values.once) {
    process.exitCode = 1;
  }
}

function tick() {
  const now = Date.now();
  let reading;
  try {
    reading = read();
  } catch (error) {
    fail(`cannot read pane ${values.pane}: ${error.message.split('\n')[0]}`);
    return;
  }
  if (!reading) {
    // In a loop the status line is only briefly off screen, so the next tick reads it; `--once` gets no next tick.
    if (values.once) {
      fail(`no weekly status line in pane ${values.pane}`);
    }
    return;
  }
  const last = changes.at(-1);
  // A rise means the weekly window reset, so the old trend no longer applies.
  if (last && reading.pct > last.pct) {
    changes.length = 0;
  }
  if (values.once) {
    report(now, reading);
    return;
  }
  if (last && reading.pct === last.pct) {
    return;
  }
  const entry = { t: now, pct: reading.pct };
  changes.push(entry);
  if (tornAt !== null) {
    truncateSync(values.log, tornAt);
    tornAt = null;
  }
  appendFileSync(values.log, `${JSON.stringify(entry)}\n`);
  report(now, reading);
}

tick();
if (!values.once) {
  setInterval(tick, everySeconds * MS_PER_SECOND);
}
