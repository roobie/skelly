// npm lockfile entries, dated by the registry's publish time for each version.
import { fetchJson, mapBounded } from './registry.mjs';

/** @typedef {import('./registry.mjs').Entry} Entry */
/** @typedef {{ packages?: Record<string, { name?: string, version?: string, resolved?: string }> }} Lockfile */

const REGISTRY = 'https://registry.npmjs.org/';
const LOCKFILE_NAME = 'package-lock.json';
const NODE_MODULES = 'node_modules/';

/**
 * The registry packages a lockfile installs, as `name@version` keys mapped to `{ name, version }`.
 * @param {Lockfile | undefined} lockfile
 */
export function registryEntries(lockfile) {
  /** @type {Map<string, Entry>} */
  const entries = new Map();
  for (const [path, { name: packageName, version, resolved }] of Object.entries(lockfile?.packages ?? {})) {
    if (!(path.includes(NODE_MODULES) && resolved?.startsWith(REGISTRY) && version !== undefined)) {
      continue;
    }
    const name = packageName ?? path.slice(path.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
    entries.set(`${name}@${version}`, { name, version });
  }
  return entries;
}

/**
 * The publish time of each version of a package, keyed by version.
 * @param {string} name
 * @returns {Promise<Record<string, string>>}
 */
const fetchReleaseTimes = async (name) => (await fetchJson(`${REGISTRY}${name.replace('/', '%2f')}`))?.time ?? {};

export const npm = {
  label: 'npm',
  /** @param {string} path */
  isManifest: (path) => path === LOCKFILE_NAME || path.endsWith(`/${LOCKFILE_NAME}`),
  /** @param {string} text */
  entries: (text) => registryEntries(JSON.parse(text)),
  /** @param {Entry[]} entries */
  async dated(entries) {
    const times = await mapBounded(new Set(entries.map(({ name }) => name)), fetchReleaseTimes);
    return entries.map((entry) => {
      const released = times.get(entry.name)?.[entry.version];
      return { ...entry, released: released === undefined ? undefined : new Date(released) };
    });
  },
};
