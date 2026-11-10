import { BindingRegistry } from '@skelly/engine/input';
import { KeyboardInput } from '@skelly/presentation/internal/presentation/inputBindings.ts';
import { type Engine, startPlay } from '@skelly/presentation/play';
import type { SaveController } from '@skelly/presentation/ui';
import { expect, it } from 'vitest';
import { INPUT_BINDINGS } from '../src/product/controls.ts';
import { ragdollConfig } from '../src/product/ragdoll.ts';
import { baseRegistry } from './baseRegistry.ts';

it('rejects a save-bound content-selected guide before runtime actions or save access', async () => {
  const { guidance } = [...baseRegistry().layouts.values()].find((layout) => layout.guidance)!;
  const engine = new Proxy({} as Engine, {
    get: (_target, key) => {
      if (key === 'site') {
        return { guidance };
      }
      throw new Error('Runtime accessed before save-isolation admission');
    },
  });
  const saveController = new Proxy({} as SaveController, {
    get: () => {
      throw new Error('Save accessed before save-isolation admission');
    },
  });
  const none = { packs: [], urls: {} };
  const assets = { audio: none, models: none, cursors: none, figures: none };
  const keyboard = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS));
  await expect(
    startPlay(engine, undefined, { assets, keyboard, ragdoll: ragdollConfig, saveController }),
  ).rejects.toThrow('Practice cannot bind a save or restore a world');
});
