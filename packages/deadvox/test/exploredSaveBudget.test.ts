import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_MAX_PAYLOAD_BYTES, decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { columnArrival } from '../src/game/columnArrival.ts';
import { configFromUrl } from '../src/game/config.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { createWorldSetup, type WorldSetup } from '../src/game/worldSetup.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { startupContent } from './baseRegistry.ts';

// Save size and save time are held to these bounds against explored area (`DESIGN.md`, "Edits persist").
// A failing bound is not fixed by raising a constant: the round that crosses it raises a BR card that
// reopens whether explored furniture stays resident and saved, or the save stays one record.
// The size bound is half the load cap, which leaves room for the rest of the state to grow. The sampled
// squares lie on the stress city's furnished core, so extrapolating their growth to the target area is
// a ceiling for dense furnishing; the bench measures the whole area.
const TARGET_EXPLORED_COLUMNS = 10_000;
const EXPLORED_SAVE_BUDGET_BYTES = DEFAULT_MAX_PAYLOAD_BYTES / 2;
// The pause is the hitch at each autosave; the encode runs in the worker.
const SNAPSHOT_PAUSE_BUDGET_MS = 100;
const ENCODE_BUDGET_MS = 2000;
// The default suite samples small squares; the bench samples the target area.
const SAMPLED_SIDES = [5, 9] as const;
// Exploring the target area through the column path takes seconds; only the bench runs it. The timeout
// is a hang guard, about fifteen times the bench's measured run; the budgets above are CPU time.
const BENCH_TIMEOUT_MS = 60_000;
const TARGET_SIDE = Math.ceil(Math.sqrt(TARGET_EXPLORED_COLUMNS));

// biome-ignore lint/style/noProcessEnv: timings are asserted only under the bench script.
const benchmarking = process.env.DEADVOX_BENCH === '1';

afterEach(() => vi.unstubAllGlobals());

const content = startupContent();
const { registry } = content;
const version = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: {},
  contentPacks: [{ id: 'fixture', version: '1', canonicalHash: 'b'.repeat(64) }],
};

const worldSetup = (): WorldSetup => {
  vi.stubGlobal(
    'Worker',
    class {
      postMessage = vi.fn();
    },
  );
  const config = configFromUrl(new URLSearchParams('site=city'), content);
  return createWorldSetup(config, new ChunkMeshes(config.scale.blockSize, registry));
};

const session = (source: WorldSetup, restore?: Readonly<SaveSnapshot>) =>
  createSession({
    registry,
    world: source.world,
    entities: source.entities,
    isSolid: source.isSolid,
    isOpaque: source.isOpaque,
    scale: source.config.scale,
    seed: source.config.seed,
    start: 0,
    spawn: [1, 1, 1],
    ready: () => false,
    controls: {
      active: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restore ? { restore } : {}),
  });

const exploreSquare = (side: number) => {
  const source = worldSetup();
  const runtime = session(source);
  const arrival = columnArrival(runtime, source);
  const from = -Math.floor(side / 2);
  for (let cz = from; cz < from + side; cz++) {
    for (let cx = from; cx < from + side; cx++) {
      arrival.load(cx, cz);
    }
  }
  return { source, runtime };
};

const encodeOptions = (source: WorldSetup) => ({
  generation: 1,
  version,
  worldOptions: { blockSize: source.config.scale.blockSize, site: source.config.site, storeys: 1, density: null },
});

// CPU time, not wall time: a loaded runner stretches the wall clock but not the work done.
const cpuMs = (since: NodeJS.CpuUsage) => {
  const used = process.cpuUsage(since);
  return (used.user + used.system) / 1000;
};

const sample = async (side: number) => {
  const { source, runtime } = exploreSquare(side);
  const pauseStarted = process.cpuUsage();
  const snapshot = runtime.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
  const pauseMs = cpuMs(pauseStarted);
  const encodeStarted = process.cpuUsage();
  const bytes = await encodeSave(snapshot, encodeOptions(source));
  const encodeMs = cpuMs(encodeStarted);
  const decodeStarted = process.cpuUsage();
  const decoded = await decodeSave(bytes, { version, contentLookup: (kind, id) => contentLookup(registry, kind, id) });
  const decodeMs = cpuMs(decodeStarted);
  return {
    columns: side * side,
    pieces: snapshot.character.inventory.entities.entities.length,
    snapshot,
    decoded: decoded.snapshot,
    inflatedBytes: gunzipSync(bytes).byteLength,
    compressedBytes: bytes.byteLength,
    pauseMs,
    encodeMs,
    decodeMs,
  };
};

it('keeps decompressed save growth per explored column inside the target-area size budget', async () => {
  const [small, large] = await Promise.all(SAMPLED_SIDES.map(sample));
  expect(large!.snapshot.world.rolledColumns.length).toBe(large!.columns);
  // Without furnished columns in the samples the bound below would pass vacuously.
  expect(large!.pieces).toBeGreaterThan(small!.pieces);
  expect(small!.pieces).toBeGreaterThan(0);
  const perColumn = (large!.inflatedBytes - small!.inflatedBytes) / (large!.columns - small!.columns);
  expect(perColumn * TARGET_EXPLORED_COLUMNS).toBeLessThan(EXPLORED_SAVE_BUDGET_BYTES);
});

it('round-trips the save of each sampled explored area to an equal snapshot', async () => {
  for (const { snapshot, decoded } of await Promise.all(SAMPLED_SIDES.map(sample))) {
    expect(decoded).toEqual(snapshot);
  }
});

it('keeps snapshot pause and encode time at the target explored area inside budget', {
  skip: !benchmarking,
  timeout: BENCH_TIMEOUT_MS,
}, async () => {
  const result = await sample(TARGET_SIDE);
  // biome-ignore lint/style/noProcessEnv: names the runner the measurement was taken on.
  const runner = process.env.GITHUB_ACTIONS === 'true' ? 'ubuntu-latest' : 'local';
  process.stdout.write(
    `SAVE_BUDGET_EXPLORED runner=${runner} columns=${result.columns} size=${result.inflatedBytes} compressedSize=${result.compressedBytes} pauseMs=${result.pauseMs.toFixed(1)} encodeMs=${result.encodeMs.toFixed(1)} decodeMs=${result.decodeMs.toFixed(1)}\n`,
  );
  expect(result.inflatedBytes).toBeLessThan(EXPLORED_SAVE_BUDGET_BYTES);
  expect(result.pauseMs).toBeLessThan(SNAPSHOT_PAUSE_BUDGET_MS);
  expect(result.encodeMs).toBeLessThan(ENCODE_BUDGET_MS);
});
