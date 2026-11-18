#!/usr/bin/env node
// Fails when a change adds or bumps a dependency released less than one month before its head
// commit; see `docs/dependency-age.md` for which dependencies and why the age is measured so.
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { actions } from './actions.mjs';
import { npm } from './npm.mjs';
import { pypi } from './pypi.mjs';

/** @typedef {import('./registry.mjs').Entry} Entry */
/** @typedef {import('./registry.mjs').DatedEntry} DatedEntry */
/** @typedef {import('./registry.mjs').Ecosystem} Ecosystem */

/** @type {Ecosystem[]} */
const ECOSYSTEMS = [npm, actions, pypi];

/**
 * Entries the head has that the base does not: additions and bumps. Both map `name@version` keys to entries.
 * @param {Map<string, Entry>} base
 * @param {Map<string, Entry>} head
 */
export function addedEntries(base, head) {
  return [...head].filter(([key]) => !base.has(key)).map(([, entry]) => entry);
}

/**
 * The same instant one calendar month earlier, in UTC, clamped to the end of a shorter month.
 * @param {Date} instant
 */
export function oneMonthBefore(instant) {
  const year = instant.getUTCFullYear();
  const month = instant.getUTCMonth() - 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const earlier = new Date(instant);
  earlier.setUTCFullYear(year, month, Math.min(instant.getUTCDate(), lastDay));
  return earlier;
}

/**
 * Entries not released more than one month before `addedAt`; one with no release time counts
 * as too young.
 * @param {DatedEntry[]} entries
 * @param {Date} addedAt
 */
export function tooYoungEntries(entries, addedAt) {
  const cutoff = oneMonthBefore(addedAt);
  return entries.filter(({ released }) => released === undefined || !(released < cutoff));
}

/** @param {string[]} args */
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** @param {string} revision */
const trackedPaths = (revision) => git('ls-tree', '-r', '--name-only', revision).split('\n');

/**
 * Every entry the ecosystem's manifests at `revision` name.
 * @param {Ecosystem} ecosystem
 * @param {string | undefined} revision
 * @param {string[]} paths
 */
const entriesAt = (ecosystem, revision, paths) =>
  new Map(
    paths.filter(ecosystem.isManifest).flatMap((path) => [...ecosystem.entries(git('show', `${revision}:${path}`))]),
  );

async function main() {
  const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string', default: 'HEAD' } } });
  const { head } = values;
  const base = values.base === undefined ? undefined : git('merge-base', values.base, head).trim();
  const addedAt = new Date(git('log', '-1', '--format=%cI', head).trim());
  const cutoff = oneMonthBefore(addedAt).toISOString();
  const basePaths = base === undefined ? [] : trackedPaths(base);
  const headPaths = trackedPaths(head);

  let checked = 0;
  let young = 0;
  for (const ecosystem of ECOSYSTEMS) {
    const added = addedEntries(entriesAt(ecosystem, base, basePaths), entriesAt(ecosystem, head, headPaths));
    // biome-ignore lint/performance/noAwaitInLoops: one ecosystem at a time keeps each registry's load bounded.
    const tooYoung = tooYoungEntries(await ecosystem.dated(added), addedAt);
    for (const { name, version, released } of tooYoung) {
      const when = released === undefined ? 'has no release time' : `was released ${released.toISOString()}`;
      process.stderr.write(`${ecosystem.label} ${name}@${version} ${when}, not before ${cutoff}\n`);
    }
    checked += added.length;
    young += tooYoung.length;
  }
  process.stdout.write(`dependency-age: ${checked} added or bumped entries checked, ${young} too young\n`);
  process.exitCode = young === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
