import { expect, it } from 'vitest';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { practiceConfigFromUrl } from '../src/game/config.ts';
import type { Engine } from '../src/game/engine.ts';
import { assertPracticeIsolation, type StartPlayOptions, startPlay } from '../src/game/play.ts';
import type { SaveController } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { content } from './fixtures/startupContent.ts';

it('rejects a save-bound content-selected guide before runtime actions or save access', () => {
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
  expect(() => startPlay(engine, undefined, { saveController })).toThrow(
    'Practice cannot bind a save or restore a world',
  );
});

const recordedSnapshot = {} as SaveSnapshot;
const recordedReplay = {} as NonNullable<StartPlayOptions['replay']>;

it('admits an input replay of a guided site, which restores its own recorded snapshot', () => {
  expect(() => assertPracticeIsolation({ restore: recordedSnapshot, replay: recordedReplay }, true)).not.toThrow();
});

it('rejects restoring a world into a guided site outside an input replay', () => {
  expect(() => assertPracticeIsolation({ restore: recordedSnapshot }, true)).toThrow(
    'Practice cannot bind a save or restore a world',
  );
});

const practiceSite = (query: string) => practiceConfigFromUrl(`https://example.org/deadvox/?${query}`, content)?.site;

it('runs a site whose layout has guidance as practice however the URL reaches it', () => {
  const { registry } = content;
  const guided = [...registry.layouts.values()].find((layout) => layout.guidance)!.id;
  const start = [...registry.starts.values()].find((row) => row.site === guided && !row.debugOnly)!.id;
  expect(practiceSite(`start=${start}`)).toBe(guided);
  expect(practiceSite(`site=${guided}&save-backend=indexeddb`)).toBe(guided);
  expect(registry.layouts.get(practiceSite('tutorial=1') ?? '')?.guidance).toBeDefined();
});

it('does not run a site without guidance as practice', () => {
  const unguided = [...content.registry.layouts.values()].find((layout) => !layout.guidance)!.id;
  expect(practiceSite(`site=${unguided}`)).toBeUndefined();
});
