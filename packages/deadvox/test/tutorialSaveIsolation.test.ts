import { expect, it } from 'vitest';
import type { Engine } from '../src/game/engine.ts';
import { startPlay } from '../src/game/play.ts';
import type { SaveController } from '../src/ui/saveController.ts';

it('rejects a save-bound practice session before accessing any runtime or save owner', () => {
  const engine = new Proxy({} as Engine, {
    get: () => {
      throw new Error('Runtime accessed before save-isolation admission');
    },
  });
  const saveController = new Proxy({} as SaveController, {
    get: () => {
      throw new Error('Save accessed before save-isolation admission');
    },
  });
  expect(() => startPlay(engine, undefined, { tutorial: true, saveController })).toThrow(
    'Practice cannot bind a save or restore a world',
  );
});
