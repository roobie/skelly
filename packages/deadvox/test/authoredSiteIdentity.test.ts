import { expect, it } from 'vitest';
import type { SiteLayoutDef } from '../../engine/src/core/schema.ts';
import { siteFromUrl } from '../src/game/config.ts';
import { makeAttemptLayout } from './fixtures/attemptPolicy.ts';

it('admits a scene name only while its authored row is available', () => {
  const layout = makeAttemptLayout({ id: 'testHouse' });
  const registry = { layouts: new Map<string, SiteLayoutDef>(), scenarios: new Map() };
  const params = new URLSearchParams({ site: layout.id });
  expect(siteFromUrl(params, 'fixture_fallback', registry).site).toBe('fixture_fallback');
  registry.layouts.set(layout.id, layout);
  expect(siteFromUrl(params, 'fixture_fallback', registry).site).toBe(layout.id);
});
