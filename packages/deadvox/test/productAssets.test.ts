import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { admitPacks } from '../src/core/packAdmission.ts';
import { bundledAssetUrl } from '../src/presentation/bundledAssets.ts';
import { productAssets } from '../src/product/assets.ts';
import { packFileOrigin, readBundledPacks } from '../tools/readBundledPacks.ts';

const packageRoot = resolve(import.meta.dirname, '..');

it("every admitted model row's file resolves to a URL, external rows included", () => {
  const inputs = readBundledPacks(packageRoot);
  const admitted = admitPacks(inputs);
  expect(admitted.issues).toEqual([]);
  const { registry, issues } = buildRegistry(admitted.sources);
  expect(issues).toEqual([]);
  const rows = [...registry.models.values()].map((model) => {
    const { source } = registry.modelOrigins.get(model.id)!;
    const pack = inputs.find((input) => source.startsWith(`${input.source}/`))!;
    return { model, source, origin: packFileOrigin(packageRoot, pack, model.file) };
  });
  const unresolved = rows.filter(({ model, source }) => !bundledAssetUrl(productAssets.models, source, model.file));
  expect(unresolved.map(({ model }) => model.id)).toEqual([]);
  expect(rows.some(({ origin }) => origin === 'external')).toBe(true);
});
