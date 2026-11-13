import { resolve } from 'node:path';
import { ContentFileSchema } from '@skelly/engine/internal/core/schema.ts';
import { admitPacks } from '@skelly/engine/packs';
import { bundledAssetUrl } from '@skelly/presentation/internal/presentation/bundledAssets.ts';
import { parse } from 'valibot';
import { expect, it } from 'vitest';
import { productAssets } from '../src/product/assets.ts';
import { packFileOrigin, readBundledPacks } from '../tools/readBundledPacks.ts';

const packageRoot = resolve(import.meta.dirname, '..');

it("every admitted model row's file resolves to a URL, external rows included", () => {
  const inputs = readBundledPacks(packageRoot);
  const admitted = admitPacks(inputs);
  expect(admitted.issues).toEqual([]);
  // Asset lookup needs admitted model rows, not a second full simulation-registry build.
  const rows = admitted.sources.flatMap(({ source, data }) => {
    const file = parse(ContentFileSchema, data);
    const pack = inputs.find((input) => source.startsWith(`${input.source}/`))!;
    return (file.models ?? []).map((model) => ({
      model,
      source,
      origin: packFileOrigin(packageRoot, pack, model.file),
    }));
  });
  expect(rows.length).toBeGreaterThan(0);
  const unresolved = rows.filter(({ model, source }) => !bundledAssetUrl(productAssets.models, source, model.file));
  expect(unresolved.map(({ model }) => model.id)).toEqual([]);
  expect(rows.some(({ origin }) => origin === 'external')).toBe(true);
});
