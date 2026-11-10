import type { SiteLayoutDef } from '@skelly/engine/internal/core/schema.ts';
import { siteFromUrl } from '@skelly/engine/session';
import { expect, it } from 'vitest';
import { makeAttemptLayout } from './fixtures/attemptPolicy.ts';

it('admits a scene name only while its authored row is available', () => {
  const layout = makeAttemptLayout({ id: 'testHouse' });
  const registry = { layouts: new Map<string, SiteLayoutDef>(), scenarios: new Map() };
  const params = new URLSearchParams({ site: layout.id });
  expect(siteFromUrl(params, 'fixture_fallback', registry).site).toBe('fixture_fallback');
  registry.layouts.set(layout.id, layout);
  expect(siteFromUrl(params, 'fixture_fallback', registry).site).toBe(layout.id);
});
