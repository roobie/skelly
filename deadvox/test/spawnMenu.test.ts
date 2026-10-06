import { NoToneMapping } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { WORK_IN_PROGRESS } from '../src/core/inventory.ts';
import { createDebugActions, dispatchDebugAction } from '../src/debug/index.ts';
import { LookControls } from '../src/debug/look.ts';
import { SpawnMenu, spawnMenuViewModel } from '../src/debug/spawnMenu.ts';
import type { DebugHooks } from '../src/game/debugInterface.ts';
import { FakeMood } from './fakeMood.ts';
import { FakeShadows } from './fakeShadows.ts';

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
  it('never offers payload-less native work through search or an empty filter', () => {
    const fixture = buildRegistry([
      {
        source: 'work.json',
        data: {
          items: [
            { id: WORK_IN_PROGRESS, name: 'Work in progress', category: 'tool', weight: 0, size: [2, 2] },
            { id: 'rag', name: 'Rag', category: 'material', weight: 1, size: [1, 1] },
          ],
        },
      },
    ]).registry;
    expect(spawnMenuViewModel(fixture, '', '').items.map(({ id }) => id)).toEqual(['rag']);
    expect(spawnMenuViewModel(fixture, 'work', '').items).toEqual([]);
  });
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

  it('leaves the search field empty when the G keydown opens the spawn menu', () => {
    const field = { value: 'g', focus: vi.fn(), blur: vi.fn() };
    const root = { hidden: true, querySelector: () => field } as unknown as HTMLElement;
    const menu = new SpawnMenu(
      registry,
      () => 'spawned',
      () => undefined,
    );
    menu.setRoot(root);
    const sim = {
      godMode: false,
      compression: { active: false, stop: () => undefined },
      emit: () => undefined,
      hurt: () => undefined,
    };
    const hooks = { sim, compress: () => undefined } as unknown as DebugHooks;
    const actions = createDebugActions({
      hooks,
      look: new LookControls(
        { toneMapping: NoToneMapping, toneMappingExposure: 1 },
        {
          linearColorsOn: false,
          setLinearColors: () => undefined,
          patternsOn: true,
          setPatterns: () => undefined,
          occlusionOn: true,
          setOcclusion: () => undefined,
        },
        new FakeMood(),
        { weather: { fogginess: 0.2 }, shadows: new FakeShadows(), flashlight: { strength: 1 } },
      ),
      build: { on: false, toggle: () => undefined },
      spawnMenu: menu,
      toggleSpawn: () => menu.open(),
      isNoclip: () => false,
      toggleNoclip: () => undefined,
      isDanger: () => false,
      toggleDanger: () => undefined,
      shamblerCount: () => 1,
      spawnShambler: () => undefined,
      isAimEnabled: () => true,
      toggleAim: () => undefined,
      isFrozen: () => false,
      toggleFrozen: () => undefined,
      isGameFrozen: () => false,
      toggleGameFrozen: () => undefined,
      impactLaser: { enabled: () => true, toggle: () => undefined },
      exportInputReplay: () => undefined,
      chooseInputReplay: () => undefined,
    });

    expect(dispatchDebugAction(actions, 'debug.spawn-menu-toggle')).toBe(true);
    expect(menu.isOpen).toBe(true);
    expect(field.value).toBe('');
    expect(field.focus).toHaveBeenCalledOnce();
  });

  it('clamps semantic navigation, confirms a spawn, and dismisses without spawning', () => {
    const field = { value: '', focus: vi.fn(), blur: vi.fn() };
    const root = { hidden: true, querySelector: () => field, querySelectorAll: () => [] } as unknown as HTMLElement;
    const spawn = vi.fn((id: string) => `${id} spawned`);
    const menu = new SpawnMenu(registry, spawn, () => undefined);
    menu.setRoot(root);
    menu.open();
    expect(menu.viewModel.selectedIndex).toBe(0);
    menu.handleAction('spawn.next');
    expect(menu.viewModel.selectedIndex).toBe(1);
    menu.handleAction('spawn.next');
    menu.handleAction('spawn.next');
    expect(menu.viewModel.selectedIndex).toBe(2);
    menu.handleAction('spawn.confirm');
    expect(spawn).toHaveBeenCalledWith('flashlight');
    expect(menu.isOpen).toBe(false);
    expect(field.blur).toHaveBeenCalledOnce();

    menu.open();
    menu.handleAction('spawn.dismiss');
    expect(menu.isOpen).toBe(false);
    expect(spawn).toHaveBeenCalledOnce();
  });
});
