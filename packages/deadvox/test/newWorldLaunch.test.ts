// @vitest-environment happy-dom
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { type ActiveBrowserMod, currentSaveVersionIdentity, encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { ScenarioRun } from '../src/core/scenarioRun.ts';
import { realTimestamp } from '../src/core/time.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import type { SaveLoadResult } from '../src/game/saveStorage.ts';
import { shouldConfirmPageLeave } from '../src/ui/leaveConfirmation.ts';
import { SaveController } from '../src/ui/saveController.ts';
import { showWin } from '../src/ui/win.ts';
import { capture, createRuntime, registry as saveFixtureRegistry } from './snapshotTestSupport.ts';

const FULL_HASH = /[a-f0-9]{64}/;
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
const recordOf = async (
  snapshot: SaveSnapshot,
  identity: Awaited<ReturnType<typeof currentSaveVersionIdentity>>,
): Promise<SaveLoadResult> => ({
  generation: 1,
  slot: 'a',
  payload: await encodeSave(snapshot, {
    generation: 1,
    version: identity.components,
    buildRevision: identity.buildRevision,
    worldOptions: {
      blockSize: 0.5,
      site: snapshot.character.scenarioRun?.scenario ?? 'forest',
      storeys: 1,
      density: 0.75,
    },
  }),
  corruptSlots: [],
});
const recordFor = (worldId: string, identity: Awaited<ReturnType<typeof currentSaveVersionIdentity>>) =>
  recordOf(snapshotForWorld(worldId), identity);
const stubLiveRecord = (controller: SaveController, record: SaveLoadResult) => {
  vi.spyOn(controller.storage, 'status').mockResolvedValue({
    backend: 'indexeddb',
    persistent: false,
    quota: { supported: false },
  });
  vi.spyOn(controller.storage, 'listNamespaces').mockResolvedValue([]);
  vi.spyOn(controller.storage, 'load').mockResolvedValue(record);
};

const title = (mods: readonly ActiveBrowserMod[] = []) => {
  const body = readFileSync('index.html', 'utf8').match(BODY_MARKUP)?.[1];
  if (!body) {
    throw new Error('Title fixture needs the actual body markup');
  }
  document.body.innerHTML = body.replace(SCRIPT_MARKUP, '');
  return new SaveController('auto', [], mods);
};

const browserMods = [{ id: 'fixture-mod', version: '1', data: { items: [] } }];

it('offers Continue for a save with the same admitted browser mods', async () => {
  enableSaveEnvironment();
  const controller = title(browserMods);
  const identity = await currentSaveVersionIdentity([], browserMods);
  stubLiveRecord(controller, await recordFor('fixture-world', identity));
  await controller.prepare();
  expect(await controller.validateContent(saveFixtureRegistry)).toBeDefined();
  expect(document.getElementById('continue')!.hidden).toBe(false);
});

it('refuses Continue and names the browser mod missing from a saved world', async () => {
  enableSaveEnvironment();
  const controller = title();
  const saved = await currentSaveVersionIdentity([], browserMods);
  const record = await recordFor('fixture-world', saved);
  stubLiveRecord(controller, record);
  vi.spyOn(controller.storage, 'listNamespaces').mockResolvedValue([saved.digest]);
  vi.spyOn(controller.storage, 'load').mockImplementation((namespace) =>
    Promise.resolve(namespace === saved.digest ? record : undefined),
  );
  sessionStorage.setItem('deadvox.continue-namespace', saved.digest);
  await controller.prepare();
  await controller.validateContent(saveFixtureRegistry);
  expect(controller.isRestored).toBe(false);
  expect(document.getElementById('continue')!.hidden).toBe(true);
  const status = document.getElementById('save-status')!.textContent!;
  expect(status).toContain(browserMods[0]!.id);
  expect(status).not.toContain('browser.fixture-mod');
  expect(status).not.toMatch(FULL_HASH);
});

it('preserves an older simulation save without appending decoder diagnostics', async () => {
  enableSaveEnvironment();
  const controller = title();
  const running = await currentSaveVersionIdentity();
  const record = await recordFor('fixture-world', {
    ...running,
    components: { ...running.components, simulationHash: 'a'.repeat(64) },
  });
  const saved = JSON.parse(gunzipSync(record.payload).toString('utf8')).versionIdentity;
  stubLiveRecord(controller, record);
  vi.spyOn(controller.storage, 'listNamespaces').mockResolvedValue([saved.digest]);
  vi.spyOn(controller.storage, 'load').mockImplementation((namespace) =>
    Promise.resolve(namespace === saved.digest ? record : undefined),
  );
  await controller.prepare();
  await controller.validateContent(saveFixtureRegistry);
  const status = document.getElementById('save-status')!.textContent!;
  expect(status).toContain(saved.digest.slice(0, 12));
  expect(status).not.toMatch(FULL_HASH);
  expect(status).not.toContain('Save version mismatch');
});

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
    return Promise.resolve({ enter: () => undefined });
  });
  document.getElementById('go')!.click();
  await Promise.resolve();
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

it('starts the page-leave window when a saved world finishes loading', async () => {
  enableSaveEnvironment();
  localStorage.clear();
  sessionStorage.clear();
  const controller = title();
  const identity = await currentSaveVersionIdentity();
  stubLiveRecord(controller, await recordFor('fixture-live-world', identity));
  sessionStorage.setItem('deadvox.continue-namespace', identity.digest);
  await controller.prepare();

  const loadedAtRealSeconds = 42;
  const now = vi.spyOn(performance, 'now').mockReturnValue(loadedAtRealSeconds * 1000);
  try {
    await controller.validateContent(saveFixtureRegistry);
    const { lastCompletedSaveRealTimestamp } = controller;
    expect(lastCompletedSaveRealTimestamp).toEqual(realTimestamp(loadedAtRealSeconds));
    expect(
      shouldConfirmPageLeave({
        gameRunning: true,
        gameDead: false,
        saveAvailable: controller.canSaveCurrentGame,
        lastSaveCompletedAtRealTimestamp: lastCompletedSaveRealTimestamp,
        nowRealTimestamp: realTimestamp(loadedAtRealSeconds),
        confirmationWindowRealSeconds: BUNDLED_CONTENT.registry.saves.get('autosave')!.leaveConfirmationRealSeconds,
      }),
    ).toBe(false);
  } finally {
    now.mockRestore();
  }
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
  let simTime = 0;
  const ids = controller.bindSession(
    () => saved,
    () => simTime,
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
  controller.setNewWorldLauncher(async () => ({ enter: () => undefined }));
  document.getElementById('go')!.click();
  await Promise.resolve();

  const internal = controller as unknown as { savedGeneration: number; checkpoints: { nextAt: number } };
  const generationBeforeDeath = internal.savedGeneration;
  controller.finishDeath();
  await vi.waitFor(() => expect(internal.savedGeneration).toBeGreaterThan(generationBeforeDeath));
  expect(localStorage.getItem(markerKey(identity.digest))).toBe(ids.worldId);

  const generationBeforeReplacement = internal.savedGeneration;
  saved = snapshotForWorld('replacement-world');
  simTime = 1;
  controller.afterFrame();
  await vi.waitFor(() => expect(internal.savedGeneration).toBeGreaterThan(generationBeforeReplacement));
  expect(localStorage.getItem(markerKey(identity.digest))).toBeNull();
});

it('protects a save whose pending ladder grab names no climbable instead of entering Continue', async () => {
  enableSaveEnvironment();
  const identity = await currentSaveVersionIdentity();
  const runtime = createRuntime(undefined, true);
  const [furniture] = runtime.entities.all;
  if (!furniture || saveFixtureRegistry.furniture.get(furniture.type)?.climbable) {
    throw new Error('The rest fixture needs a furniture piece that is not a ladder');
  }
  const continueWith = async (ladder: SaveSnapshot['character']['player']['ladder']) => {
    localStorage.clear();
    sessionStorage.clear();
    const controller = title();
    const snapshot = structuredClone(capture(runtime));
    snapshot.character.player.ladder = ladder;
    stubLiveRecord(controller, await recordOf(snapshot, identity));
    sessionStorage.setItem('deadvox.continue-namespace', identity.digest);
    await controller.prepare();
    const restored = await controller.validateContent(saveFixtureRegistry);
    return { restored: restored !== undefined, entered: controller.isEntered, canSave: controller.canSaveCurrentGame };
  };

  expect(await continueWith(null)).toEqual({ restored: true, entered: true, canSave: true });
  expect(await continueWith({ on: false, grabbedUid: furniture.uid })).toEqual({
    restored: false,
    entered: false,
    canSave: false,
  });
});

it('creates and binds once across pending launch clicks and enters after controller commitment', async () => {
  const controller = title();
  const actors: Character[] = [];
  const events: string[] = [];
  const bind = vi.spyOn(controller, 'bindSession');
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  await controller.prepare();
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  let releaseConstruction!: () => void;
  const construction = new Promise<void>((done) => {
    releaseConstruction = done;
  });
  let didEnter!: () => void;
  const entered = new Promise<void>((done) => {
    didEnter = done;
  });
  let launches = 0;
  controller.setNewWorldLauncher(async () => {
    launches += 1;
    await construction;
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
        didEnter();
      },
    };
  });
  expect(actors).toHaveLength(0);
  document.getElementById('save-replace-confirm')!.click();
  expect(actors).toHaveLength(0);
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  expect(document.getElementById('go')!.getAttribute('aria-disabled')).toBe('true');
  document.getElementById('go')!.click();
  expect(launches).toBe(1);
  expect(actors).toHaveLength(0);
  releaseConstruction();
  await entered;
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
    return Promise.reject(new Error('Fixture initialization failure'));
  });
  document.getElementById('go')!.click();
  await Promise.resolve();
  expect(controller.isEntered).toBe(false);
  document.getElementById('go')!.click();
  expect(attempts).toBe(1);
});

it('reports entry rejection and prevents retrying the partially entered world', async () => {
  const controller = title();
  await controller.prepare();
  const failure = new Error('Fixture entry failure');
  let launches = 0;
  controller.setNewWorldLauncher(() => {
    launches += 1;
    return Promise.resolve({
      enter: () => {
        throw failure;
      },
    });
  });
  document.getElementById('go')!.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.getElementById('save-status')!.textContent).toContain(failure.message);
  expect(controller.isEntered).toBe(false);
  document.getElementById('go')!.click();
  expect(launches).toBe(1);
});

it('refuses invalid creation choice and freezes Left only on accepted creation', async () => {
  const controller = title();
  await controller.prepare();
  const select = document.getElementById('dominant-hand') as HTMLSelectElement;
  const actors: Character[] = [];
  controller.setNewWorldLauncher((creation) => {
    expect(Object.isFrozen(creation)).toBe(true);
    actors.push(new Character(buildRegistry([]).registry, creation));
    return Promise.resolve({ enter: () => undefined });
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
  await Promise.resolve();
});

it('acknowledges only the won checkpoint and keeps a failed completion visible for retry', async () => {
  enableSaveEnvironment();
  const identity = await currentSaveVersionIdentity();
  const controller = title();
  const calendar =
    fixtureSnapshot.character.simulation.clock.start +
    fixtureSnapshot.character.simulation.time * fixtureSnapshot.character.simulation.clock.ratio;
  const run = new ScenarioRun([...saveFixtureRegistry.scenarios.keys()][0]!, calendar);
  let snapshot = { ...fixtureSnapshot, character: { ...fixtureSnapshot.character, scenarioRun: run.snapshot() } };
  stubLiveRecord(controller, await recordOf(snapshot, identity));
  sessionStorage.setItem('deadvox.continue-namespace', identity.digest);
  await controller.prepare();
  await controller.validateContent(saveFixtureRegistry);
  controller.bindSession(
    () => snapshot,
    () => 0,
    { blockSize: 0.5, site: run.snapshot().scenario, storeys: 1, density: null },
    { checkpointSimSeconds: 1 },
  );
  const acknowledgements = Array.from({ length: 3 }, () => {
    let resolve!: (value: { generation: number; slot: 'a'; backend: 'indexeddb' }) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<{ generation: number; slot: 'a'; backend: 'indexeddb' }>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  });
  let writes = 0;
  let secondStarted!: () => void;
  const queuedStarted = new Promise<void>((resolve) => {
    secondStarted = resolve;
  });
  vi.spyOn(controller.storage, 'save').mockImplementation(() => {
    const index = writes;
    writes += 1;
    if (index === 1) {
      secondStarted();
    }
    return acknowledgements[index]!.promise;
  });
  controller.beforeSleep();
  run.complete(calendar);
  snapshot = { ...snapshot, character: { ...snapshot.character, scenarioRun: run.snapshot() } };
  controller.finishWin();
  expect(controller.winCheckpointStatus).toBe('pending');
  acknowledgements[0]!.resolve({ generation: 2, slot: 'a', backend: 'indexeddb' });
  await queuedStarted;
  expect(controller.winCheckpointStatus).toBe('pending');
  acknowledgements[1]!.reject(new Error('fixture storage refusal'));
  await acknowledgements[1]!.promise.catch(() => undefined);
  expect(controller.winCheckpointStatus).toBe('failed');
  expect(document.getElementById('save-recovery')!.hidden).toBe(false);
  const winRoot = document.getElementById('death')!;
  showWin(winRoot, {
    seed: 13,
    run: run.snapshot(),
    checkpoint: controller.winCheckpointStatus,
    newWorld: () => undefined,
    freshAttempt: () => undefined,
    exportRun: () => undefined,
  });
  expect(winRoot.querySelectorAll('button').length).toBeGreaterThan(0);
  document.getElementById('save-retry')!.click();
  acknowledgements[2]!.resolve({ generation: 3, slot: 'a', backend: 'indexeddb' });
  await acknowledgements[2]!.promise;
  expect(controller.winCheckpointStatus).toBe('saved');
  expect(document.getElementById('save-recovery')!.hidden).toBe(true);
  expect(controller.lastCompletedSaveRealTimestamp).toBeDefined();
});

it('refuses a save made under a different clock ratio instead of crashing startup', async () => {
  enableSaveEnvironment();
  const identity = await currentSaveVersionIdentity();
  const { simulation } = fixtureSnapshot.character;
  const retimed = {
    ...fixtureSnapshot,
    character: {
      ...fixtureSnapshot.character,
      simulation: { ...simulation, clock: { ...simulation.clock, ratio: simulation.clock.ratio * 2 } },
    },
  };
  const controller = title();
  stubLiveRecord(controller, await recordOf(retimed, identity));
  sessionStorage.setItem('deadvox.continue-namespace', identity.digest);
  await controller.prepare();
  expect(await controller.validateContent(saveFixtureRegistry)).toBeUndefined();
  expect(controller.isRestored).toBe(false);
});

it('continues a won record as terminal but refuses an ordinary dead record', async () => {
  enableSaveEnvironment();
  const identity = await currentSaveVersionIdentity();
  const calendar =
    fixtureSnapshot.character.simulation.clock.start +
    fixtureSnapshot.character.simulation.time * fixtureSnapshot.character.simulation.clock.ratio;
  const run = new ScenarioRun([...saveFixtureRegistry.scenarios.keys()][0]!, calendar);
  run.complete(calendar);
  const won = { ...fixtureSnapshot, character: { ...fixtureSnapshot.character, scenarioRun: run.snapshot() } };
  const controller = title();
  stubLiveRecord(controller, await recordOf(won, identity));
  sessionStorage.setItem('deadvox.continue-namespace', identity.digest);
  await controller.prepare();
  expect((await controller.validateContent(saveFixtureRegistry))!.character.scenarioRun).toEqual(run.snapshot());
  expect(controller.isEntered).toBe(true);
  expect(controller.winCheckpointStatus).toBe('saved');
  sessionStorage.clear();
  const dead = createRuntime();
  dead.sim.hurt(1000, 'fixture injury');
  dead.session.frame(1 / 60);
  expect(dead.sim.dead).toBeDefined();
  const deadController = title();
  stubLiveRecord(deadController, await recordOf(capture(dead), identity));
  sessionStorage.setItem('deadvox.continue-namespace', identity.digest);
  await deadController.prepare();
  expect(await deadController.validateContent(saveFixtureRegistry)).toBeUndefined();
  expect(deadController.isEntered).toBe(false);
  expect(document.getElementById('continue')!.hidden).toBe(true);
});
