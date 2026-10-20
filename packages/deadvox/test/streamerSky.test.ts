import { DoubleSide, type Group, InstancedMesh, Mesh, OrthographicCamera } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { buildMesh } from '../src/core/mesher.ts';
import { makeScale } from '../src/core/scale.ts';
import { buildSkyResult } from '../src/core/skyTransport.ts';
import { World } from '../src/core/world.ts';
import { Streamer } from '../src/game/streamer.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { PileMeshes } from '../src/render/piles.ts';
import type { ToMesher } from '../src/worker/protocol.ts';
import { baseRegistry, baseTerrainShape } from './baseRegistry.ts';
import { skyFixture } from './fixtures/sky.ts';

class OwnedWorker {
  static instances: OwnedWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | undefined;
  readonly waiting: Exclude<ToMesher, { type: 'init' }>[] = [];
  readonly posted: string[] = [];
  colors: Uint8Array = new Uint8Array();
  patterns: Uint8Array = new Uint8Array();
  weatherable: Uint8Array = new Uint8Array();
  constructor() {
    OwnedWorker.instances.push(this);
  }
  postMessage(message: ToMesher, transfer: ArrayBuffer[]) {
    const copy = structuredClone(message, { transfer });
    if (copy.type === 'init') {
      this.colors = copy.colors;
      this.patterns = copy.patterns;
      this.weatherable = copy.weatherable;
      return;
    }
    this.waiting.push(copy);
    this.posted.push(copy.type);
  }
  replyNext(index = 0) {
    const [message] = this.waiting.splice(index, 1);
    if (!message) {
      throw new Error('No worker request');
    }
    const data =
      message.type === 'mesh'
        ? {
            type: 'mesh',
            key: message.key,
            version: message.version,
            ms: 0,
            mesh: buildMesh(message.padded, this.colors, {
              patterns: this.patterns,
              wide: message.wide,
              weatherable: this.weatherable,
            }),
          }
        : { type: 'sky', result: buildSkyResult(message.input), workerRealMs: 0 };
    this.onmessage?.({ data });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  OwnedWorker.instances = [];
});

it('meshes a partial recorded ring without generating extra columns and repairs it when a neighbour arrives', () => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
  vi.stubGlobal('Worker', OwnedWorker);
  const scale = { ...makeScale(0.5), minCy: 0, maxCy: 0 };
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() };
  const streamer = new Streamer({
    world: new World(),
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 4).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 1,
    surface: { height: () => 20, top: () => undefined },
  });
  streamer.setReplayControlled();
  streamer.update(0, 0);
  expect(streamer.generateForReplay(0, 0)).toBe(true);
  streamer.update(0, 0);
  const worker = OwnedWorker.instances[0]!;
  expect(worker.waiting).toHaveLength(1);
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(1);
  worker.replyNext();
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(0);
  expect(streamer.generatedColumns()).toEqual([[0, 0]]);
  expect(streamer.generateForReplay(1, 0)).toBe(true);
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(1);
  streamer.update(0, 0);
  worker.replyNext();
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(0);
  expect(meshes.set).toHaveBeenCalled();
  const recorded = [
    [0, 0],
    [1, 0],
  ] as const;
  expect(streamer.unmeshedRecordedColumns(0, 0, recorded, 0)).toBe(0);
  expect(streamer.unmeshedRecordedColumns(0, 0, recorded, 1)).toBe(1);
  streamer.unloadForReplay(1, 0);
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(1);
});

it.each([0, 1])('blocks sight past an incomplete column (height %i), even after moving', (missingCy) => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
  vi.stubGlobal('Worker', OwnedWorker);
  const scale = { ...makeScale(0.5), minCy: 0, maxCy: 1 };
  const world = new World();
  const registry = baseRegistry();
  registry.furniture.set('reveal_piece', {
    id: 'reveal_piece',
    name: 'Fixture piece',
    size: [1, 1, 1],
    color: '#888888',
  });
  registry.items.set('reveal_item', {
    id: 'reveal_item',
    name: 'Fixture item',
    size: [1, 1],
    weight: 1,
    category: 'misc',
    economy: registry.items.values().next().value!.economy,
  });
  const inventory = new Inventory(registry);
  const contentPosition: [number, number, number] = [2 * CHUNK + 1, 1, 1];
  const entity = inventory.furnish({ type: 'reveal_piece', pos: contentPosition, size: [1, 1, 1], facing: 'n' });
  expect(entity).toBeDefined();
  expect(inventory.add(inventory.create('reveal_item'), { kind: 'pile', pos: contentPosition })).toBe(true);
  const snapshot = inventory.snapshotState();
  const meshes = new ChunkMeshes(scale.blockSize, registry);
  const furniture = new FurnitureMeshes(scale.blockSize, meshes);
  const piles = new PileMeshes(scale.blockSize, undefined, 17, meshes);
  const drawnContents = (group: Group, shadow: boolean) => {
    const drawn: Mesh[] = [];
    group.traverseVisible((object) => {
      if (
        object instanceof Mesh &&
        (!(object instanceof InstancedMesh) || object.count > 0) &&
        (!shadow || object.castShadow)
      ) {
        drawn.push(object);
      }
    });
    return drawn;
  };
  const streamer = new Streamer({
    world,
    meshes,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 3).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 2,
    surface: { height: () => -1, top: () => undefined },
    stamp: (chunk) => chunk.set(1, 1, 1, 1),
  });
  streamer.setReplayControlled();
  streamer.update(0, 0);
  const columns = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ] as const;
  for (const [cx, cz] of columns) {
    expect(streamer.generateForReplay(cx, cz)).toBe(true);
  }
  const worker = OwnedWorker.instances[0]!;
  const missing = `1,${missingCy},0`;
  const drain = (hold: string | undefined) => {
    for (let step = 0; step < columns.length * 4; step++) {
      streamer.update(0, 0);
      const index = worker.waiting.findIndex((message) => message.type === 'mesh' && message.key !== hold);
      if (index >= 0) {
        worker.replyNext(index);
      }
    }
  };
  const visible = (contentsExpected = false) => {
    furniture.sync(inventory.entities);
    piles.sync(inventory);
    for (const group of [furniture.group, piles.group]) {
      for (const shadow of [false, true]) {
        const drawn = drawnContents(group, shadow);
        if (contentsExpected) {
          expect(drawn.length).toBeGreaterThan(0);
        } else {
          expect(drawn).toEqual([]);
        }
      }
    }
    expect(inventory.snapshotState()).toEqual(snapshot);
    meshes.selectShadowCasters(() => true, DoubleSide);
    const shadows = meshes.group.children.filter((mesh) => mesh.visible).map((mesh) => mesh.position.toArray());
    const camera = new OrthographicCamera(-200, 200, 200, -200, 0.1, 1000);
    camera.position.set(0, 100, 100);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    meshes.cull(camera);
    expect(meshes.group.children.filter((mesh) => mesh.visible).map((mesh) => mesh.position.toArray())).toEqual(
      shadows,
    );
    return shadows.map(([x, , z]) => `${x! / CHUNK},${z! / CHUNK}`);
  };
  drain(missing);
  expect(worker.waiting.some((message) => message.type === 'mesh' && message.key === missing)).toBe(true);
  expect([...meshes.keys()]).toContain('2,0,0');
  expect(new Set(visible())).toEqual(new Set(['0,0', '0,1']));
  drain(undefined);
  expect(new Set(visible(true))).toEqual(new Set(columns.map(([cx, cz]) => `${cx},${cz}`)));
  const edits = world.setBlock(CHUNK + 1, 1, 1, 2);
  streamer.markEdited(edits);
  streamer.update(0, 0);
  expect(new Set(visible(true))).toEqual(new Set(columns.map(([cx, cz]) => `${cx},${cz}`)));
  drain(undefined);
  streamer.unloadForReplay(1, 0);
  expect(new Set(visible())).toEqual(new Set(['0,0', '0,1']));
  // The player may change columns before the new corridor is generated.
  streamer.update(3 * CHUNK, 0);
  expect(visible()).toEqual([]);
});

it('delivers the first mesh before sky and admits queued sky at the next completion despite mesh backlog', () => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
  vi.stubGlobal('Worker', OwnedWorker);
  const scale = { ...makeScale(0.5), minCy: 0, maxCy: 0 };
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() };
  const streamer = new Streamer({
    world: new World(),
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 4).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 1,
    surface: { height: () => 20, top: () => undefined },
  });
  const receive = vi.fn();
  expect(streamer.requestSky(skyFixture().capture().input, receive)).toBe(true);
  const worker = OwnedWorker.instances[0]!;
  expect(worker.posted).toEqual([]);
  for (let step = 0; step < 32 && worker.waiting.length < 2; step++) {
    streamer.update(0, 0);
  }
  expect(worker.posted).toEqual(['mesh', 'mesh']);
  expect(streamer.pending).toBeGreaterThan(0);
  worker.replyNext();
  expect(meshes.set).toHaveBeenCalledTimes(1);
  expect(meshes.set.mock.calls[0]![2].indices.length).toBeGreaterThan(0);
  expect(receive).not.toHaveBeenCalled();
  expect(streamer.isReady(0, 0)).toBe(true);
  expect(worker.waiting.map((message) => message.type)).toEqual(['mesh', 'sky']);
  streamer.update(0, 0);
  expect(worker.posted).toEqual(['mesh', 'mesh', 'sky']);
  worker.replyNext();
  streamer.update(0, 0);
  expect(worker.waiting.map((message) => message.type)).toEqual(['sky', 'mesh']);
  worker.replyNext();
  expect(receive).toHaveBeenCalledTimes(1);
  worker.replyNext();
  expect(meshes.set.mock.calls.length).toBeGreaterThan(1);
});
