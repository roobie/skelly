import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { ItemPictures } from '../src/render/itemPictures.ts';
import { ModelLibrary } from '../src/render/models.ts';

const fixture = () => {
  const { registry, issues } = buildRegistry([
    {
      source: 'picture-fixture',
      data: {
        models: [{ id: 'pictured', file: 'assets/models/pictured.glb' }],
        items: ['pictured', 'text_only'].map((id) => ({
          id,
          name: id,
          category: 'misc',
          weight: 1,
          size: [1, 1],
          economy: { usage: [], tiers: [] },
          ...(id === 'pictured' ? { model: id } : {}),
        })),
      },
    },
  ]);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  return { registry, inv: new Inventory(registry) };
};

it('does not cache missing pictures while models load, and reuses completed stills', () => {
  const { registry, inv } = fixture();
  const models = { version: 0, has: () => models.version > 0, groundLook: vi.fn(() => new Group()) };
  const paint = vi.fn(() => 'still');
  const pictures = new ItemPictures(registry, models, paint);
  expect(pictures.picture(inv.create('text_only'))).toBeUndefined();
  const item = inv.create('pictured');
  expect(pictures.picture(item)).toBeUndefined();
  expect(paint).not.toHaveBeenCalled();
  models.version += 1;
  expect(pictures.version).toBe(models.version);
  expect(pictures.picture(item)).toBe('still');
  expect(pictures.picture(inv.create('pictured'))).toBe('still');
  expect(paint).toHaveBeenCalledTimes(1);
});

it('reports a declared model load failure rather than treating it as absent authored art', () => {
  const { registry, inv } = fixture();
  const load = vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((_url, _ready, _progress, failed) => {
    failed!(new Error('fixture load failure'));
  });
  try {
    const report = vi.fn();
    const models = new ModelLibrary(registry, report, { 'assets/models/pictured.glb': '/fixture.glb' });
    expect(new ItemPictures(registry, models).picture(inv.create('pictured'))).toBeUndefined();
    expect(report).toHaveBeenCalledWith(expect.stringContaining('fixture load failure'));
  } finally {
    load.mockRestore();
  }
});
