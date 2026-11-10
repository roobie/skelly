import { BindingRegistry } from '@skelly/engine/input';
import { expect, it } from 'vitest';
import type { Engine } from '../src/presentation/engine.ts';
import { KeyboardInput } from '../src/presentation/inputBindings.ts';
import { startPlay } from '../src/presentation/play.ts';
import { INPUT_BINDINGS } from '../src/product/controls.ts';
import type { SaveController } from '../src/ui/saveController.ts';
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
  await expect(startPlay(engine, undefined, { assets, keyboard, saveController })).rejects.toThrow(
    'Practice cannot bind a save or restore a world',
  );
});
