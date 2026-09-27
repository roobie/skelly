import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { spawnMenuViewModel } from '../src/debug/spawnMenu.ts';

const { registry } = buildRegistry([
  {
    source: 'fixture.json',
    data: {
      models: [{ id: 'flashlight_model', file: 'assets/models/flashlight_model.glb' }],
      items: [
        {
          id: 'flashlight',
          name: 'Flashlight',
          category: 'tool',
          weight: 200,
          size: [1, 1],
          model: 'flashlight_model',
        },
        { id: 'rag', name: 'Rag', category: 'material', weight: 20, size: [1, 1] },
        { id: 'can_of_beans', name: 'Can of beans', category: 'food', weight: 400, size: [1, 1] },
      ],
    },
  },
]);

describe('spawnMenuViewModel', () => {
  it('lists every item, category then name, with an empty filter', () => {
    const vm = spawnMenuViewModel(registry, '', '');
    expect(vm.items.map((i) => i.id)).toEqual(['can_of_beans', 'rag', 'flashlight']);
  });

  it('marks an item with a model in its meta text', () => {
    const vm = spawnMenuViewModel(registry, '', '');
    expect(vm.items.find((i) => i.id === 'flashlight')?.meta).toBe('tool, model');
    expect(vm.items.find((i) => i.id === 'rag')?.meta).toBe('material');
  });

  it('filters by every word of the filter, against name, id and category', () => {
    expect(spawnMenuViewModel(registry, 'can', '').items.map((i) => i.id)).toEqual(['can_of_beans']);
    expect(spawnMenuViewModel(registry, 'food beans', '').items.map((i) => i.id)).toEqual(['can_of_beans']);
    expect(spawnMenuViewModel(registry, 'tool', '').items.map((i) => i.id)).toEqual(['flashlight']);
  });

  it('matches nothing when a word matches no item', () => {
    expect(spawnMenuViewModel(registry, 'nonexistent', '').items).toEqual([]);
  });

  it('carries the filter and status through unchanged', () => {
    const vm = spawnMenuViewModel(registry, 'rag', 'Rag is at your feet');
    expect(vm.filter).toBe('rag');
    expect(vm.status).toBe('Rag is at your feet');
  });
});
