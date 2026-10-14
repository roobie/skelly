import { afterEach, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { resolveGraphics } from '../src/core/graphics.ts';
import { configFromUrl } from '../src/game/config.ts';
import { createEngine } from '../src/game/engine.ts';
import { writeGraphicsSettings } from '../src/game/graphicsSettings.ts';

const owner = vi.hoisted(() => ({ setup: undefined as unknown }));
vi.mock('../src/game/worldSetup.ts', () => ({ createWorldSetup: () => owner.setup }));
afterEach(() => vi.unstubAllGlobals());

it('benchmark engines use mod defaults despite saved graphics preferences and debug URL overrides', () => {
  const scale = { label: 'Fixture scale', min: 0.2, max: 1, default: 0.7 };
  const toggle = { label: 'Fixture toggle', options: [false, true], default: true };
  const tuning = {
    renderScale: scale,
    bloomScale: scale,
    smallSunMap: toggle,
    fastCamo: toggle,
    coarseWeathering: toggle,
  };
  const { registry } = buildRegistry([
    { source: 'fixture', data: { graphics: [{ id: CORE_CONTENT_IDS.coreGraphics, ...tuning }] } },
  ]);
  owner.setup = { registry };
  let saved = '';
  const storage = {
    getItem: vi.fn(() => saved),
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  writeGraphicsSettings(tuning, { renderScale: scale.min, fastCamo: false }, storage);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('location', { search: '?renderscale=0.2&camofast=0' });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
    },
  );
  const config = configFromUrl(new URLSearchParams('debug=1'));
  const view = { clientWidth: 1, clientHeight: 1 } as HTMLElement;
  const player = createEngine(config, view, undefined, { render: false });
  expect(player.graphics.values.fastCamo).toBe(false);
  storage.getItem.mockClear();
  const benchmark = createEngine(config, view, undefined, { render: false, graphicsSource: 'mod' });
  expect(benchmark.graphics.values).toEqual(resolveGraphics(tuning));
  expect(storage.getItem).not.toHaveBeenCalled();
});
