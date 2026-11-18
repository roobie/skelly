import assert from 'node:assert/strict';
import test from 'node:test';
import { actionRefs, refReleasedAt } from './actions.mjs';

const SHA = 'a'.repeat(40);

test('a workflow names its remote actions and reusable workflows by repository, not local or Docker actions', () => {
  const workflow = `
jobs:
  build:
    uses: owner/workflows/.github/workflows/build.yml@v2
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: "github/codeql-action/init@${SHA}" # v3.1.0
      - uses: ./.github/actions/local
      - uses: docker://alpine@sha256:${'b'.repeat(64)}
`;

  assert.deepEqual(
    [...actionRefs(workflow).values()],
    [
      { name: 'owner/workflows', version: 'v2' },
      { name: 'actions/checkout', version: 'v4' },
      { name: 'github/codeql-action', version: SHA },
    ],
  );
});

/**
 * @param {string} tag
 * @param {string} publishedAt
 * @param {Partial<import('./actions.mjs').Release>} [flags]
 */
const release = (tag, publishedAt, flags = {}) => ({
  // biome-ignore lint/style/useNamingConvention: the fixture mirrors the GitHub API's field names.
  tag_name: tag,
  // biome-ignore lint/style/useNamingConvention: the fixture mirrors the GitHub API's field names.
  published_at: publishedAt,
  draft: false,
  prerelease: false,
  ...flags,
});

const releases = [
  release('v4.0.0-beta', '2023-08-01T00:00:00Z', { prerelease: true }),
  release('v4.0.0', '2023-09-01T00:00:00Z'),
  release('v4.1.0', '2024-01-01T00:00:00Z'),
  release('v40.0.0', '2020-01-01T00:00:00Z'),
  release('v5.0.0', '2026-11-01T00:00:00Z'),
];

test('a moving tag is released when its line first had a published release', () => {
  assert.equal(refReleasedAt('v4', releases, [])?.toISOString(), '2023-09-01T00:00:00.000Z');
});

test('an exact tag is released with its own release', () => {
  assert.equal(refReleasedAt('v4.1.0', releases, [])?.toISOString(), '2024-01-01T00:00:00.000Z');
});

test('a commit SHA is released with the first release of a tag pointing at it', () => {
  const tags = [
    { name: 'v4.1.0', commit: { sha: SHA } },
    { name: 'v4', commit: { sha: SHA } },
    { name: 'v4.0.0', commit: { sha: 'c'.repeat(40) } },
  ];

  assert.equal(refReleasedAt(SHA, releases, tags)?.toISOString(), '2024-01-01T00:00:00.000Z');
});

test('a branch, an untagged commit or a prerelease-only tag has no release time', () => {
  assert.equal(refReleasedAt('main', releases, []), undefined);
  assert.equal(refReleasedAt(SHA, releases, []), undefined);
  assert.equal(refReleasedAt('v4.0.0-beta', releases, []), undefined);
});
