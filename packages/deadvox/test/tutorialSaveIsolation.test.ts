import { BindingRegistry } from '@skelly/engine/input';
import { KeyboardInput } from '@skelly/presentation/internal/presentation/inputBindings.ts';
import { type Engine, type PlayPage, startPlay } from '@skelly/presentation/play';
import type { SaveController } from '@skelly/presentation/ui';
import { expect, it } from 'vitest';
import { INPUT_BINDINGS } from '../src/product/controls.ts';
import { ragdollConfig } from '../src/product/ragdoll.ts';
import { baseRegistry } from './baseRegistry.ts';

const guidedStart = (options: { saveController?: SaveController; restore?: object; replay?: object }) => {
  const { guidance } = [...baseRegistry().layouts.values()].find((layout) => layout.guidance)!;
  const engine = new Proxy({} as Engine, {
    get: (_target, key) => {
      if (key === 'site') {
        return { guidance };
      }
      throw new Error('Runtime accessed before save-isolation admission');
    },
  });
  const none = { packs: [], urls: {} };
  const assets = { audio: none, models: none, cursors: none, figures: none };
  const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS));
  const unusedPage = new Proxy({} as PlayPage, {
    get: () => {
      throw new Error('Page accessed before save-isolation admission');
    },
  });
  return startPlay(engine, undefined, {
    assets,
    page: unusedPage,
    keyboard,
    ragdoll: ragdollConfig,
    ...options,
  } as Parameters<typeof startPlay>[2]);
};

it('rejects a save-bound content-selected guide before runtime actions or save access', async () => {
  const saveController = new Proxy({} as SaveController, {
    get: () => {
      throw new Error('Save accessed before save-isolation admission');
    },
  });
  await expect(guidedStart({ saveController })).rejects.toThrow('Practice cannot bind a save or restore a world');
});

it('rejects a non-replay restore into a content-selected guide before runtime actions', async () => {
  await expect(guidedStart({ restore: {} })).rejects.toThrow('Practice cannot bind a save or restore a world');
});

it('admits a replay restore into a content-selected guide past isolation', async () => {
  // The replay's own runtime access is the first thing after admission, so reaching it proves admission passed.
  await expect(guidedStart({ restore: {}, replay: {} })).rejects.toThrow(
    'Runtime accessed before save-isolation admission',
  );
});
