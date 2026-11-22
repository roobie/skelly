// Holdout's plant stores answer the shared works stores brief, whose storage service holds a stores to shelving or
// crates a body can stand beside; the restoration fixture places that answer, so its supplies stay within reach.
import { buildingBriefIssues } from '@skelly/engine/internal/core/buildingBriefs.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { templateDrawReaches } from '@skelly/engine/internal/core/templateSpatial.ts';
import { compileAssembly } from '@skelly/engine/internal/core/templates.ts';
import { selectBundledMods } from '@skelly/engine/packs';
import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { productModIntake } from '../src/product/mods.ts';
import { baseRegistry, overlayContent } from './baseRegistry.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';

const selected = withReusedBuilds(() =>
  selectBundledMods(productModIntake, ['skelly.deadvox.scenario.holdout.restoration']),
);
const { registry } = selected.content;
const restoration = registry.scenarios.get('holdout_restoration')!;
if (restoration.kind !== 'composedSite') {
  throw new Error('The restoration fixture stages a composed site');
}
// The one briefed assembly the restoration fixture places is the stores answer.
const stores = restoration.asks
  .map(({ template }) => (template === undefined ? undefined : registry.mapAssemblies.get(template)))
  .find((assembly) => assembly?.brief !== undefined)!;

it('fits Holdout plant stores to the brief they answer', () => {
  expect(stores, 'the restoration fixture places a briefed stores').toBeDefined();
  expect(buildingBriefIssues(registry).filter(({ id }) => id === stores.id)).toEqual([]);
});

it('fails the storage service of a stores whose only shelf no body can stand beside', () => {
  const fixture = JSON.parse(
    compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/boxed-stores.jsonnet'),
  ) as ContentFile;
  const boxed = fixture.mapAssemblies![0]!.id;
  const issues = buildingBriefIssues(overlayContent(baseRegistry(), [{ source: 'boxed-stores', data: fixture }]));
  const own = issues.filter(({ id }) => id === boxed).map(({ message }) => message);
  expect(own).toHaveLength(1);
  expect(own[0]).toMatch(/breaks the services rule .*no piece serving "storage" stands beside a walk/);
});

it('keeps every stocked piece of the restoration stores beside a walk from its door', () => {
  const template = compileAssembly(registry, stores, { seed: 0, siteId: 'stores-reach' });
  const stocked = template.pieces.filter(({ items, loot }) => items !== undefined || loot !== undefined);
  expect(stocked.length, 'the stores carries its supplies').toBeGreaterThan(0);
  const beside = templateDrawReaches(
    registry,
    template,
    () => false,
  )({
    pieces: template.pieces,
    free: () => false,
    extra: [],
  });
  expect(stocked.filter((piece) => !beside(piece)).map(({ furniture, pos }) => ({ furniture, pos }))).toEqual([]);
});
