// Exact pins in pip requirements files, dated by PyPI's first upload of each version.
import { earliest, fetchJson, mapBounded } from './registry.mjs';

/** @typedef {import('./registry.mjs').Entry} Entry */

const PYPI = 'https://pypi.org/pypi/';
const REQUIREMENTS_FILE = /(^|\/)requirements[^/]*\.txt$/;
const LINE_CONTINUATION = /\\\r?\n/g;
const COMMENT = /(^|\s)#.*$/;
const EXACT_PIN = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*==\s*([^\s;]+)/;
const NAME_SEPARATORS = /[-_.]+/g;

/** The name PyPI files a project under, so spellings of one project share a key. */
export const normalizedName = (name) => name.toLowerCase().replace(NAME_SEPARATORS, '-');

/** The `name==version` pins of a requirements file, as `name@version` keys mapped to `{ name, version }`. */
export function pinnedRequirements(text) {
  /** @type {Map<string, Entry>} */
  const entries = new Map();
  for (const line of text.replace(LINE_CONTINUATION, ' ').split('\n')) {
    const pin = EXACT_PIN.exec(line.replace(COMMENT, '').trim());
    if (pin) {
      const name = normalizedName(pin[1]);
      const version = /** @type {string} */ (pin[2]);
      entries.set(`${name}@${version}`, { name, version });
    }
  }
  return entries;
}

/** A version's release time: the first upload of any of its files. `versionJson` is PyPI's per-version document. */
export const firstUpload = (versionJson) =>
  earliest((versionJson?.urls ?? []).map((file) => file.upload_time_iso_8601));

export const pypi = {
  label: 'pypi',
  /** @param {string} path */
  isManifest: (path) => REQUIREMENTS_FILE.test(path),
  entries: pinnedRequirements,
  /** @param {Entry[]} entries */
  async dated(entries) {
    const versions = await mapBounded(new Set(entries.map(({ name, version }) => `${name}/${version}`)), (path) =>
      fetchJson(`${PYPI}${path}/json`),
    );
    return entries.map((entry) => ({
      ...entry,
      released: firstUpload(versions.get(`${entry.name}/${entry.version}`)),
    }));
  },
};
