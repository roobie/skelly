// GitHub Actions refs in workflows, dated by the action repository's releases; see
// `docs/dependency-age.md`, "GitHub Actions" for what a ref's release time is.
import process from 'node:process';
import { earliest, fetchResponse, mapBounded } from './registry.mjs';

/** @typedef {import('./registry.mjs').Entry} Entry */
/** @typedef {{ tag_name: string, published_at: string | null, draft: boolean, prerelease: boolean }} Release */
/** @typedef {{ name: string, commit: { sha: string } }} Tag */

const API = 'https://api.github.com/repos/';
const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const USES = /^\s*(?:-\s+)?uses:\s*(['"]?)([^'"\s#]+)\1/gm;
const OUT_OF_SCOPE = ['./', 'docker://'];
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const NEXT_PAGE = /<([^>]+)>;\s*rel="next"/;
// biome-ignore lint/style/noProcessEnv: CI hands over the job's token this way; without it the API's anonymous rate limit applies.
const TOKEN = process.env.GITHUB_TOKEN;
const API_HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
};

/**
 * The remote actions and reusable workflows a workflow uses, as `owner/repo@ref` keys mapped
 * to `{ name: owner/repo, version: ref }`. Local and Docker actions are left out.
 */
export function actionRefs(text) {
  /** @type {Map<string, Entry>} */
  const entries = new Map();
  for (const [, , action] of text.matchAll(USES)) {
    const at = action.lastIndexOf('@');
    if (OUT_OF_SCOPE.some((prefix) => action.startsWith(prefix)) || at < 0) {
      continue;
    }
    const name = action.slice(0, at).split('/').slice(0, 2).join('/');
    const version = action.slice(at + 1);
    entries.set(`${name}@${version}`, { name, version });
  }
  return entries;
}

/**
 * A ref's release time: the first published, non-prerelease release it names. A tag names
 * its own release and, as a moving tag such as `v4`, every release in its line (`v4.x`); a
 * commit SHA names the releases of the tags that point at it. A branch names none.
 * @param {string} ref
 * @param {Release[]} releases
 * @param {Tag[]} tags
 */
export function refReleasedAt(ref, releases, tags) {
  const taggedCommit = COMMIT_SHA.test(ref)
    ? new Set(tags.filter((tag) => tag.commit.sha === ref).map((tag) => tag.name))
    : undefined;
  const named = (tagName) =>
    taggedCommit ? taggedCommit.has(tagName) : tagName === ref || tagName.startsWith(`${ref}.`);
  return earliest(
    releases
      .filter((release) => !(release.draft || release.prerelease) && release.published_at && named(release.tag_name))
      .map((release) => release.published_at),
  );
}

/** Every item of a paginated list, or none when the repository is unknown. */
async function fetchAllPages(url) {
  const items = [];
  /** @type {string | undefined} */
  let next = `${url}?per_page=100`;
  while (next !== undefined) {
    // biome-ignore lint/performance/noAwaitInLoops: each page names the next one.
    const response = await fetchResponse(next, API_HEADERS);
    if (response === undefined) {
      break;
    }
    items.push(...(await response.json()));
    next = NEXT_PAGE.exec(response.headers.get('link') ?? '')?.[1];
  }
  return items;
}

export const actions = {
  label: 'actions',
  /** @param {string} path */
  isManifest: (path) => WORKFLOW_FILE.test(path),
  entries: actionRefs,
  /** @param {Entry[]} entries */
  async dated(entries) {
    const shaPinned = new Set(entries.filter(({ version }) => COMMIT_SHA.test(version)).map(({ name }) => name));
    const repositories = await mapBounded(new Set(entries.map(({ name }) => name)), async (name) => ({
      releases: await fetchAllPages(`${API}${name}/releases`),
      tags: shaPinned.has(name) ? await fetchAllPages(`${API}${name}/tags`) : [],
    }));
    return entries.map((entry) => {
      const { releases, tags } = repositories.get(entry.name);
      return { ...entry, released: refReleasedAt(entry.version, releases, tags) };
    });
  },
};
