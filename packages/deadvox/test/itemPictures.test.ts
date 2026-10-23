import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { ItemPictures, referencePainter } from '../src/render/itemPictures.ts';
import { ModelLibrary } from '../src/render/models.ts';

const fixture = () => {
  const { registry, issues } = buildRegistry([
    {
      source: 'picture-fixture',
      data: {
        models: ['pictured', 'other', 'third'].map((id) => ({ id, file: `assets/models/${id}.glb` })),
        items: ['pictured', 'other', 'third', 'text_only'].map((id) => ({
          id,
          name: id,
          category: 'misc',
          workInProgress: false,
          notLoot: false,
          weight: 1,
          size: [1, 1],
          economy: { usage: [], tiers: [] },
          ...(id === 'text_only' ? {} : { model: id }),
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
  const pictures = new ItemPictures(registry, models, 2, { paint, dispose: vi.fn() });
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

it('evicts the least recently used still and regenerates it on demand within capacity', () => {
  const { registry, inv } = fixture();
  const models = { version: 1, has: () => true, groundLook: () => new Group() };
  const paint = vi.fn(() => `still-${paint.mock.calls.length}`);
  const pictures = new ItemPictures(registry, models, 2, { paint, dispose: vi.fn() });
  const [a, b, c] = ['pictured', 'other', 'third'].map((id) => inv.create(id));
  const first = pictures.picture(a!);
  pictures.picture(b!);
  expect(pictures.picture(a!)).toBe(first);
  pictures.picture(c!);
  expect(pictures.picture(a!)).toBe(first);
  expect(paint).toHaveBeenCalledTimes(3);
  expect(pictures.picture(b!)).toBe('still-4');
  expect(pictures.picture(a!)).toBe(first);
  expect(pictures.picture(c!)).toBe('still-5');
});

it('clears pictures and disposes its painter exactly once without restarting it', () => {
  const { registry, inv } = fixture();
  const painter = { paint: vi.fn(() => 'still'), dispose: vi.fn() };
  const pictures = new ItemPictures(
    registry,
    { version: 1, has: () => true, groundLook: () => new Group() },
    1,
    painter,
  );
  const item = inv.create('pictured');
  expect(pictures.picture(item)).toBe('still');
  pictures.dispose();
  pictures.dispose();
  expect(painter.dispose).toHaveBeenCalledTimes(1);
  expect(pictures.picture(item)).toBeUndefined();
  expect(painter.paint).toHaveBeenCalledTimes(1);
});

it('lazily owns and releases the renderer and context without disposing shared model resources', () => {
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  const model = new Mesh(geometry, material);
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const materialDispose = vi.spyOn(material, 'dispose');
  const renderer = {
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    render: vi.fn(),
    domElement: { toDataURL: () => 'still' } as HTMLCanvasElement,
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
  const create = vi.fn(() => renderer);
  const unused = referencePainter(create);
  unused.dispose();
  expect(create).not.toHaveBeenCalled();
  const painter = referencePainter(create);
  expect(painter.paint(model)).toBe('still');
  expect(painter.paint(model)).toBe('still');
  painter.dispose();
  painter.dispose();
  expect(create).toHaveBeenCalledTimes(1);
  expect(renderer.dispose).toHaveBeenCalledTimes(1);
  expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  expect(geometryDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
  expect(() => painter.paint(model)).toThrow('disposed');
  geometry.dispose();
  material.dispose();
});

it('reports a declared model load failure rather than treating it as absent authored art', () => {
  const { registry, inv } = fixture();
  const load = vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((_url, _ready, _progress, failed) => {
    failed!(new Error('fixture load failure'));
  });
  try {
    const report = vi.fn();
    const models = new ModelLibrary(registry, report, { 'assets/models/pictured.glb': '/fixture.glb' });
    expect(new ItemPictures(registry, models, 2).picture(inv.create('pictured'))).toBeUndefined();
    expect(report).toHaveBeenCalledWith(expect.stringContaining('fixture load failure'));
  } finally {
    load.mockRestore();
  }
});
