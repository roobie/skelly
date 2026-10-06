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
const WORKFLOW_FILES = readdirSync(join(ROOT, '.github/workflows')).filter((file) => file.endsWith('.yml'));
const DEPLOY_SWITCH = /pagesAnalyticsPlugin\(process\.env\.PAGES_ANALYTICS === '1'\)/;
const ANALYTICS_SCRIPT = /<script async src="[^"]*simpleanalyticscdn[^"]*"><\/script>/;
const ANALYTICS_DOMAIN = /simpleanalyticscdn/;

test('Pages analytics is absent from ordinary project pages and injected only by the opted-in build', () => {
  const developmentPlugin = pagesAnalyticsPlugin(false);
  const deploymentPlugin = pagesAnalyticsPlugin(true);
  assert.equal(developmentPlugin.apply, 'build');

  for (const configPath of PROJECT_CONFIGS) {
    assert.match(read(configPath), DEPLOY_SWITCH);
  }
  assert.deepEqual(
    WORKFLOW_FILES.filter((file) => read(`.github/workflows/${file}`).includes('PAGES_ANALYTICS=1')),
    ['pages.yml'],
  );

  for (const pagePath of PAGE_FILES) {
    const html = read(pagePath);
    assert.doesNotMatch(html, ANALYTICS_DOMAIN);
    assert.equal(developmentPlugin.transformIndexHtml(html), html);
    assert.match(deploymentPlugin.transformIndexHtml(html), ANALYTICS_SCRIPT);
  }
});
