#!/usr/bin/env node
// Fails when a change adds or bumps an npm lockfile entry younger than one month; see
// `docs/dependency-age.md` for why the age is measured from the head commit.
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const REGISTRY = 'https://registry.npmjs.org/';
const LOCKFILE_NAME = 'package-lock.json';
const NODE_MODULES = 'node_modules/';
const FETCH_CONCURRENCY = 16;

/** The registry packages a lockfile installs, as `name@version` keys mapped to `{ name, version }`. */
export function registryEntries(lockfile) {
  const entries = new Map();
  for (const [path, entry] of Object.entries(lockfile?.packages ?? {})) {
    if (!(path.includes(NODE_MODULES) && entry.resolved?.startsWith(REGISTRY))) {
      continue;
    }
    const name = entry.name ?? path.slice(path.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
    entries.set(`${name}@${entry.version}`, { name, version: entry.version });
  }
  return entries;
}

/** Entries the head lockfile installs that the base lockfile does not: additions and bumps. */
export function addedEntries(baseLockfile, headLockfile) {
  const base = registryEntries(baseLockfile);
  return [...registryEntries(headLockfile)].filter(([key]) => !base.has(key)).map(([, entry]) => entry);
}

/** The same instant one calendar month earlier, in UTC, clamped to the end of a shorter month. */
export function oneMonthBefore(instant) {
  const year = instant.getUTCFullYear();
  const month = instant.getUTCMonth() - 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const earlier = new Date(instant);
  earlier.setUTCFullYear(year, month, Math.min(instant.getUTCDate(), lastDay));
  return earlier;
}

/**
 * Entries not released more than one month before `addedAt`. `releaseTimes` maps a package
 * name to its registry `time` object; a version missing from it counts as too young.
 */
export function tooYoungEntries(entries, releaseTimes, addedAt) {
  const cutoff = oneMonthBefore(addedAt);
  return entries
    .map((entry) => {
      const released = releaseTimes.get(entry.name)?.[entry.version];
      return { ...entry, released: released === undefined ? undefined : new Date(released) };
    })
    .filter(({ released }) => released === undefined || !(released < cutoff));
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const lockfilePaths = (revision) =>
  git('ls-tree', '-r', '--name-only', revision)
    .split('\n')
    .filter((path) => path === LOCKFILE_NAME || path.endsWith(`/${LOCKFILE_NAME}`));

const lockfileAt = (revision, path) => JSON.parse(git('show', `${revision}:${path}`));

async function fetchReleaseTimes(name) {
  const response = await fetch(`${REGISTRY}${name.replace('/', '%2f')}`);
  if (!response.ok) {
    throw new Error(`registry answered ${response.status} for ${name}`);
  }
  return (await response.json()).time ?? {};
}

async function releaseTimesFor(names) {
  const queue = [...names];
  const times = new Map();
  const worker = async () => {
    for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
      // biome-ignore lint/performance/noAwaitInLoops: each worker fetches in turn so FETCH_CONCURRENCY bounds the registry load.
      times.set(name, await fetchReleaseTimes(name));
    }
  };
  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  return times;
}

async function main() {
  const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string', default: 'HEAD' } } });
  const { head } = values;
  const base = values.base === undefined ? undefined : git('merge-base', values.base, head).trim();
  const addedAt = new Date(git('log', '-1', '--format=%cI', head).trim());

  const baseLockfiles = new Set(base === undefined ? [] : lockfilePaths(base));
  const added = new Map();
  for (const path of lockfilePaths(head)) {
    const baseLockfile = baseLockfiles.has(path) ? lockfileAt(base, path) : undefined;
    for (const entry of addedEntries(baseLockfile, lockfileAt(head, path))) {
      added.set(`${entry.name}@${entry.version}`, entry);
    }
  }

  const entries = [...added.values()];
  const releaseTimes = await releaseTimesFor(new Set(entries.map(({ name }) => name)));
  const young = tooYoungEntries(entries, releaseTimes, addedAt);
  const cutoff = oneMonthBefore(addedAt).toISOString();
  for (const { name, version, released } of young) {
    const when = released === undefined ? 'has no registry release time' : `was released ${released.toISOString()}`;
    process.stderr.write(`${name}@${version} ${when}, not before ${cutoff}\n`);
  }
  process.stdout.write(
    `dependency-age: ${entries.length} added or bumped entries checked, ${young.length} too young\n`,
  );
  process.exitCode = young.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
