import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { startupContent } from './baseRegistry.ts';

const registry = startupContent().registry;
const scale = makeScale(0.5);
const FRAME = 1 / 60;

const runtime = (restore?: Readonly<SaveSnapshot>) => {
  const session = createSession({
    registry,
    world: new World(),
    scale,
    seed: 5,
    start: 43_200,
    spawn: [0.5, 1, 0.5],
    ...(restore ? { restore } : {}),
    isSolid: (_x: number, y: number) => y === 0,
    isOpaque: (_x: number, y: number) => y === 0,
    ready: () => true,
    controls: {
      active: () => true,
      blocking: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    refusal: () => undefined,
    onRead: () => undefined,
  });
  session.sim.paused = false;
  /** Runs past the once-a-second light tick, which applies the drop rule and burns fuel. */
  const tick = () => {
    for (let elapsed = 0; elapsed < 1.5; elapsed += FRAME) {
      session.frame(FRAME);
    }
  };
  return { session, tick };
};

const roundTrip = async (snapshot: Readonly<SaveSnapshot>): Promise<SaveSnapshot> => {
  const version = {
    simulationHash: 'a'.repeat(64),
    schemaVersion: SAVE_SCHEMA_VERSION,
    generators: {},
    contentPacks: [{ id: 'fixture.pack', version: '1', canonicalHash: '0'.repeat(64) }],
  };
  const bytes = await encodeSave(snapshot, {
    generation: 1,
    version,
    worldOptions: { blockSize: scale.blockSize, site: 'forest', storeys: 1, density: null },
    buildRevision: 'fixture',
  });
  return (await decodeSave(bytes, { version, contentLookup: () => true })).snapshot;
};

describe('dropped light save', () => {
  it('restores a dropped firestarter light lit on the ground with the fuel it had left', async () => {
    const type = [...registry.items.values()].find(({ light }) => light?.burning?.ignition === 'firestarter')!.id;
    const { session, tick } = runtime();
    const light = session.inventory.create(type);
    const lighter = session.inventory.create([...registry.items.values()].find(({ igniter }) => igniter)!.id);
    expect(session.inventory.add(light, { kind: 'hand', side: 'right' })).toBe(true);
    expect(session.inventory.add(lighter, { kind: 'hand', side: 'left' })).toBe(true);
    expect(session.survival.use(light)).toBeUndefined();
    expect(session.inventory.move(light, { kind: 'pile', pos: [2, 1, 0] }).ok).toBe(true);
    tick();
    const burning = {
      on: light.on,
      burnRemainingGameSeconds: light.burnRemainingGameSeconds,
      litAtGameTimestamp: light.litAtGameTimestamp,
    };
    expect(burning.on).toBe(true);

    const restored = runtime(
      await roundTrip(session.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' })),
    );
    const loaded = restored.session.inventory.itemByUid(light.uid)!;
    expect(restored.session.inventory.locate(loaded)?.kind).toBe('pile');
    expect({
      on: loaded.on,
      burnRemainingGameSeconds: loaded.burnRemainingGameSeconds,
      litAtGameTimestamp: loaded.litAtGameTimestamp,
    }).toEqual(burning);
    restored.tick();
    expect(loaded.on).toBe(true);
  });
});
