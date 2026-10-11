// @vitest-environment happy-dom
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { currentSaveVersionIdentity, encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import type { SaveLoadResult } from '../src/game/saveStorage.ts';
import { SaveController } from '../src/ui/saveController.ts';
import { capture, createRuntime, registry as saveFixtureRegistry } from './snapshotTestSupport.ts';

const BODY_MARKUP = /<body\b[^>]*>([\s\S]*)<\/body>/;
const SCRIPT_MARKUP = /<script\b[^>]*>[\s\S]*?<\/script>/g;
const fixtureSnapshot = capture(createRuntime());
const markerKey = (namespace: string) => `deadvox.dead-world:${namespace}`;
const originalEnvironment = {
  secureContext: Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'),
  crypto: Object.getOwnPropertyDescriptor(globalThis, 'crypto'),
  indexedDB: Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'),
  storage: Object.getOwnPropertyDescriptor(navigator, 'storage'),
};
const restoreDescriptor = (target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined) => {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    Reflect.deleteProperty(target, key);
  }
};
const enableSaveEnvironment = () => {
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {} });
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate: async () => ({}), persist: async () => false, persisted: async () => false },
  });
};
afterEach(() => {
  restoreDescriptor(globalThis, 'isSecureContext', originalEnvironment.secureContext);
  restoreDescriptor(globalThis, 'crypto', originalEnvironment.crypto);
  restoreDescriptor(globalThis, 'indexedDB', originalEnvironment.indexedDB);
  restoreDescriptor(navigator, 'storage', originalEnvironment.storage);
  localStorage.clear();
  sessionStorage.clear();
});
const snapshotForWorld = (id: string): SaveSnapshot => ({
  ...fixtureSnapshot,
  world: { ...fixtureSnapshot.world, id },
});
const recordFor = async (
  worldId: string,
  identity: Awaited<ReturnType<typeof currentSaveVersionIdentity>>,
): Promise<SaveLoadResult> => ({
  generation: 1,
  slot: 'a',
  payload: await encodeSave(snapshotForWorld(worldId), {
    generation: 1,
    version: identity.components,
    buildRevision: identity.buildRevision,
    worldOptions: { blockSize: 0.5, site: 'forest', storeys: 1, density: 0.75 },
  }),
  corruptSlots: [],
});
const stubLiveRecord = (controller: SaveController, record: SaveLoadResult) => {
  vi.spyOn(controller.storage, 'status').mockResolvedValue({
    backend: 'indexeddb',
    persistent: false,
    quota: { supported: false },
  });
  vi.spyOn(controller.storage, 'listNamespaces').mockResolvedValue([]);
  vi.spyOn(controller.storage, 'load').mockResolvedValue(record);
};

const title = () => {
  const body = readFileSync('index.html', 'utf8').match(BODY_MARKUP)?.[1];
  if (!body) {
    throw new Error('Title fixture needs the actual body markup');
  }
  document.body.innerHTML = body.replace(SCRIPT_MARKUP, '');
  return new SaveController();
};

it('refuses a live record marked dead and starts a new world without replacement confirmation', async () => {
  enableSaveEnvironment();
  localStorage.clear();
  sessionStorage.clear();
  const controller = title();
  const identity = await currentSaveVersionIdentity();
  const worldId = 'fixture-live-world';
  stubLiveRecord(controller, await recordFor(worldId, identity));
  localStorage.setItem(markerKey(identity.digest), worldId);

  await controller.prepare();
  expect(controller.namespace).toBe(identity.digest);
  await controller.validateContent(saveFixtureRegistry);
  expect(controller.isRestored).toBe(false);
  expect(document.getElementById('continue')!.hidden).toBe(true);

  let launches = 0;
  controller.setNewWorldLauncher(() => {
    launches += 1;
    return { enter: () => undefined };
  });
  document.getElementById('go')!.click();
  expect(document.getElementById('save-confirmation')!.hidden).toBe(true);
  expect(launches).toBe(1);
});

it('clears a marker for another world and offers the live record', async () => {
  enableSaveEnvironment();
  localStorage.clear();
  sessionStorage.clear();
  const controller = title();
  const identity = await currentSaveVersionIdentity();
  stubLiveRecord(controller, await recordFor('fixture-live-world', identity));
  localStorage.setItem(markerKey(identity.digest), 'different-world');

  await controller.prepare();
  await controller.validateContent(saveFixtureRegistry);

  expect(localStorage.getItem(markerKey(identity.digest))).toBeNull();
  expect(document.getElementById('continue')!.hidden).toBe(false);
});

it('keeps the marker for a same-world save and clears it after another world saves', async () => {
  enableSaveEnvironment();
  localStorage.clear();
  sessionStorage.clear();
  const controller = title();
  const identity = await currentSaveVersionIdentity();
  const deadWorldId = 'fixture-dead-world';
  stubLiveRecord(controller, await recordFor(deadWorldId, identity));
  localStorage.setItem(markerKey(identity.digest), deadWorldId);
  await controller.prepare();
  await controller.validateContent(saveFixtureRegistry);

  let saved = snapshotForWorld('pending-world');
  const ids = controller.bindSession(
    () => saved,
    () => 0,
    { blockSize: 0.5, site: 'forest', storeys: 1, density: 0.75 },
    { checkpointSimSeconds: 1 },
  );
  saved = snapshotForWorld(ids.worldId);
  let generation = 1;
  vi.spyOn(controller.storage, 'encodeSnapshot').mockImplementation(async (snapshot, saveGeneration, options) =>
    encodeSave(snapshot, {
      generation: saveGeneration,
      version: options.version,
      buildRevision: options.buildRevision,
      worldOptions: options.worldOptions,
    }),
  );
  vi.spyOn(controller.storage, 'save').mockImplementation(async (_namespace, encode) => {
    generation += 1;
    const next = generation;
    await encode(next);
    return { generation: next, slot: 'b', backend: 'indexeddb' };
  });
  controller.setNewWorldLauncher(() => ({ enter: () => undefined }));
  document.getElementById('go')!.click();

  const internal = controller as unknown as { savedGeneration: number; checkpoints: { nextAt: number } };
  const generationBeforeDeath = internal.savedGeneration;
  controller.finishDeath();
  await vi.waitFor(() => expect(internal.savedGeneration).toBeGreaterThan(generationBeforeDeath));
  expect(localStorage.getItem(markerKey(identity.digest))).toBe(ids.worldId);

  const generationBeforeReplacement = internal.savedGeneration;
  saved = snapshotForWorld('replacement-world');
  internal.checkpoints.nextAt = 0;
  controller.afterFrame();
  await vi.waitFor(() => expect(internal.savedGeneration).toBeGreaterThan(generationBeforeReplacement));
  expect(localStorage.getItem(markerKey(identity.digest))).toBeNull();
});

it('creates and binds only on resource-ready acceptance and enters after controller commitment', async () => {
  const controller = title();
  const actors: Character[] = [];
  const events: string[] = [];
  const bind = vi.spyOn(controller, 'bindSession');
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  await controller.prepare();
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  controller.setNewWorldLauncher(() => {
    expect(controller.isEntered).toBe(false);
    actors.push(new Character(buildRegistry([]).registry));
    events.push('create');
    controller.bindSession(
      () => {
        throw new Error('No checkpoint before entry');
      },
      () => 0,
      { blockSize: 0.5, site: 'forest', storeys: 1, density: 0 },
      { checkpointSimSeconds: 1 },
    );
    events.push('bind');
    return {
      enter: () => {
        expect(controller.isEntered).toBe(true);
        events.push('enter');
      },
    };
  });
  expect(actors).toHaveLength(0);
  document.getElementById('save-replace-confirm')!.click();
  expect(actors).toHaveLength(0);
  document.getElementById('go')!.click();
  expect(events).toEqual(['create', 'bind', 'enter']);
  expect(actors).toHaveLength(1);
  expect(bind).toHaveBeenCalledTimes(1);
  document.getElementById('go')!.click();
  expect(actors).toHaveLength(1);
  expect(bind).toHaveBeenCalledTimes(1);
});

it('does not commit or retry partial initialization after the launch callback fails', async () => {
  const controller = title();
  await controller.prepare();
  let attempts = 0;
  controller.setNewWorldLauncher(() => {
    attempts += 1;
    throw new Error('Fixture initialization failure');
  });
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  document.getElementById('go')!.click();
  expect(attempts).toBe(1);
});

it('refuses invalid creation choice and freezes Left only on accepted creation', async () => {
  const controller = title();
  await controller.prepare();
  const select = document.getElementById('dominant-hand') as HTMLSelectElement;
  const actors: Character[] = [];
  controller.setNewWorldLauncher((creation) => {
    expect(Object.isFrozen(creation)).toBe(true);
    actors.push(new Character(buildRegistry([]).registry, creation));
    return { enter: () => undefined };
  });
  select.value = 'invalid fixture value';
  document.getElementById('go')!.click();
  expect(actors).toHaveLength(0);
  select.value = 'left';
  document.getElementById('go')!.click();
  expect(actors).toHaveLength(1);
  expect(actors[0]!.handedness).toBe('left');
  select.value = 'right';
  document.getElementById('go')!.click();
  expect(actors).toHaveLength(1);
  expect(actors[0]!.handedness).toBe('left');
});
