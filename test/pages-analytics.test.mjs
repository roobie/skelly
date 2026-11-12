import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addPagesAnalytics, BADGE_ATTRIBUTE, pagesAnalyticsPlugin } from '../pagesAnalyticsPlugin.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}
// Pages that scroll like documents show the badge in a footer. The game and the full-viewport map would lose
// screen to one, so they only load the script.
const BADGE_PAGES = [
  'site/index.html',
  'site/deadvox/playtest/round1/index.html',
  'packages/deadvox/playtests/round1/index.html',
  'packages/deadvox/playtests/round2/index.html',
  'packages/deadvox/sounds.html',
];
const SCRIPT_ONLY_PAGES = ['packages/deadvox/index.html', 'packages/deadvox/map.html'];
const PAGE_FILES = [...BADGE_PAGES, ...SCRIPT_ONLY_PAGES];
const BADGE = read('pagesAnalyticsBadge.html').trimEnd();
const countOf = (text, part) => text.split(part).length - 1;
const PROJECT_CONFIGS = ['packages/deadvox/vite.config.ts'];
const WORKFLOW_FILE = /\.ya?ml$/;
const workflowFiles = (files) => files.filter((file) => WORKFLOW_FILE.test(file));
const WORKFLOW_FILES = workflowFiles(readdirSync(join(ROOT, '.github/workflows')));
const MISSING_HEAD = /requires a closing <\/head> tag/;
const DEPLOY_SWITCH = /pagesAnalyticsPlugin\(process\.env\.PAGES_ANALYTICS === '1'\)/;
const ANALYTICS_SCRIPT = /<script async src="[^"]*simpleanalyticscdn[^"]*"><\/script>/;
const ANALYTICS_DOMAIN = /simpleanalyticscdn/;

test('workflow inventory includes either supported YAML extension', () => {
  assert.deepEqual(workflowFiles(['pages.yml', 'legacy.yaml', 'notes.yml.txt']), ['pages.yml', 'legacy.yaml']);
});

test('Pages analytics is absent from ordinary project pages and injected only by the opted-in build', () => {
  const developmentPlugin = pagesAnalyticsPlugin(false);
  const deploymentPlugin = pagesAnalyticsPlugin(true);
  assert.equal(developmentPlugin.apply, 'build');

  for (const configPath of PROJECT_CONFIGS) {
    assert.match(read(configPath), DEPLOY_SWITCH);
  }
  assert.deepEqual(
    WORKFLOW_FILES.filter((file) => read(`.github/workflows/${file}`).includes('PAGES_ANALYTICS')),
    ['pages.yml'],
  );

  for (const pagePath of PAGE_FILES) {
    const html = read(pagePath);
    assert.doesNotMatch(html, ANALYTICS_DOMAIN);
    assert.equal(developmentPlugin.transformIndexHtml(html), html);
    assert.match(deploymentPlugin.transformIndexHtml(html), ANALYTICS_SCRIPT);
  }
});

test('the badge appears once, verbatim, on exactly the pages that opt in', () => {
  for (const pagePath of PAGE_FILES) {
    const published = addPagesAnalytics(read(pagePath));
    assert.equal(countOf(published, 'simpleanalyticscdn'), 1, `${pagePath} loads the script once`);
    assert.equal(countOf(published, BADGE), BADGE_PAGES.includes(pagePath) ? 1 : 0, `${pagePath} badge count`);
  }
});

test('every page that opts in lists itself here, so a new badge page is a deliberate choice', () => {
  const optedIn = PAGE_FILES.filter((pagePath) => read(pagePath).includes(BADGE_ATTRIBUTE));
  assert.deepEqual(optedIn, BADGE_PAGES);
});

test('enabled Pages analytics requires a closing head tag', () => {
  const html = '<html><body></body></html>';
  assert.equal(pagesAnalyticsPlugin(false).transformIndexHtml(html), html);
  assert.throws(() => pagesAnalyticsPlugin(true).transformIndexHtml(html), MISSING_HEAD);
});
