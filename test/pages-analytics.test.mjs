import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { pagesAnalyticsPlugin } from '../pagesAnalyticsPlugin.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const PAGE_FILES = [
  'gungen/index.html',
  'deadvox/index.html',
  'deadvox/sounds.html',
  'mobgen/index.html',
  'mobgen/stress.html',
];
const PROJECT_CONFIGS = ['gungen/vite.config.ts', 'deadvox/vite.config.ts', 'mobgen/vite.config.ts'];
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

test('enabled Pages analytics requires a closing head tag', () => {
  const html = '<html><body></body></html>';
  assert.equal(pagesAnalyticsPlugin(false).transformIndexHtml(html), html);
  assert.throws(() => pagesAnalyticsPlugin(true).transformIndexHtml(html), MISSING_HEAD);
});
