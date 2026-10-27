import { describe, expect, it, vi } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { type PlacedPowerDevice, SitePower } from '../src/core/sitePower.ts';
import { World } from '../src/core/world.ts';
import { makeConfig } from '../src/game/config.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayCommandOwners,
} from '../src/game/replayCommands.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { createWorldSetup } from '../src/game/worldSetup.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { startupContent } from './baseRegistry.ts';
import { BASE_CLOCK, BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { contentLookup, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

vi.mock('../src/game/streamer.ts', () => {
  class Streamer {}
  // biome-ignore lint/style/useNamingConvention: the mocked module exports this class name.
  return { Streamer };
});

const content = startupContent();
const base = content.registry;
const config = { ...makeConfig(7, 16, content), site: 'testHouse' };
const setup = createWorldSetup(config, new ChunkMeshes(config.scale.blockSize, base));
const house = setup.powerDevices;
const kind = (device: PlacedPowerDevice) => base.powerDevices.get(base.furniture.get(device.type)!.power!.device)!.kind;
const loads = house.filter((device) => kind(device) === 'consumer');

// Keep the house's electrical content but put the controls and appliance in reach together: each device takes the
// nearest free cell around the spawn, clear of the player's own, so the house may gain devices.
const around = Array.from({ length: 81 }, (_, i): [number, number] => [(i % 9) - 4, Math.floor(i / 9) - 4])
  .filter(([x, z]) => Math.abs(x) > 1 || Math.abs(z) > 1)
  .sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
const devices = house.map((device, index): PlacedPowerDevice => {
  const [x, z] = around[index]!;
  const pos: Vec3 = [x, 1, z];
  return { type: device.type, pos, entitySpec: { type: device.type, pos, size: [1, 1, 1], facing: 'n', fixed: true } };
});
const registry = {
  ...base,
  furniture: new Map(
    [...base.furniture].map(([id, def]) => [id, { ...def, size: [1, 1, 1] as Vec3, shape: undefined }]),
  ),
};
const fixture = (start = 0, restore?: SaveSnapshot, far = false) => {
  const world = new World();
  const chunk = new Chunk(0, 0, 0);
  world.addChunk(chunk);
  const session = createSession({
    registry,
    world,
    scale: makeScale(0.5),
    seed: 7,
    start,
    ...(restore ? { restore } : {}),
    spawn: far ? [50, 1, 50] : [0, 1, 0],
    ready: () => true,
    isSolid: (_x, y) => y === 0,
    isOpaque: () => false,
    powerDevices: devices,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  if (!restore) {
    for (const device of devices) {
      if (!base.furniture.get(device.type)!.charger) {
        session.entities.add(device.entitySpec!);
      }
    }
  }
  session.sim.paused = false;
  const control = (role: 'generator' | 'switch') => {
    const device = devices.find((entry) => kind(entry) === role)!;
    return [...session.entities.records].find((entity) => entity.type === device.type)!;
  };
  const powered = () =>
    devices.filter((device) => kind(device) === 'consumer').map((device) => session.power!.isPowered(device));
  const command = (role: 'generator' | 'switch', enabled: boolean) => {
    const payload = { kind: 'power.set' as const, entityUid: control(role).uid, enabled };
    if (!isReplayActionPayload(payload)) {
      throw new Error('Invalid fixture command');
    }
    return applyReplayActionPayload(payload, { power: session.powerControl } as ReplayCommandOwners);
  };
  const loadCharger = () => {
    const entity = [...session.entities.records].find((piece) => base.furniture.get(piece.type)!.charger)!;
    session.entities.markSearched(entity);
    const spec = base.furniture.get(entity.type)!.charger!;
    const cell = session.inventory.create(spec.batteries[0]!);
    cell.charges = 0;
    if (!session.inventory.add(cell, { kind: 'hand', side: 'right' })) {
      throw new Error('Could not hold fixture cell');
    }
    const moved = session.inventory.move(cell, { kind: 'furniture', entity, pocket: spec.pocket });
    if (!moved.ok) {
      throw new Error(moved.reason);
    }
    const refusal = session.chargerControl(entity.uid, 'start');
    if (refusal) {
      throw new Error(refusal);
    }
  };
  return {
    session,
    command,
    control,
    powered,
    loadCharger,
    snapshot: () => session.snapshot({ worldId: 'power-fixture', characterId: 'survivor' }),
  };
};

describe('house supply and player controls', () => {
  it('supplies authored layouts without streaming, including the house mixed sources and appliances', () => {
    expect(house.length).toBeGreaterThan(0);
    for (const role of ['generator', 'battery', 'solar', 'switch']) {
      expect(house.some((device) => kind(device) === role)).toBe(true);
    }
    expect(loads.some((device) => base.furniture.get(device.type)!.power!.light)).toBe(true);
    expect(loads.some((device) => base.furniture.get(device.type)!.charger)).toBe(true);
    expect(
      loads.some((device) => base.furniture.get(device.type)!.container && !base.furniture.get(device.type)!.charger),
    ).toBe(true);
    const grid = new SitePower({
      registry: base,
      devices: house,
      inventory: new Inventory(base),
      clock: BASE_CLOCK,
      cycle: BASE_DAY_CYCLE,
    });
    const ordinaryLoads = loads.filter((device) => !base.furniture.get(device.type)!.charger);
    expect(ordinaryLoads.length).toBeGreaterThan(0);
    expect(ordinaryLoads.every((device) => grid.isPowered(device))).toBe(true);
  });

  it('cuts and restores every active house consumer with the generator at night and empty storage', () => {
    const f = fixture();
    f.loadCharger();
    expect(f.powered().length).toBeGreaterThan(0);
    expect(f.powered().every(Boolean)).toBe(true);
    expect(
      f.session
        .power!.network.snapshot()
        .devices.filter((device) => base.powerDevices.get(device.type)!.kind === 'battery')
        .every((device) => device.storedMicrojoules === 0),
    ).toBe(true);
    expect(f.command('generator', false)).toBeUndefined();
    expect(f.powered().every((powered) => !powered)).toBe(true);
    expect(f.command('generator', true)).toBeUndefined();
    expect(f.powered().every(Boolean)).toBe(true);
  });

  it.each([0, 43_200])('leaves solar and storage independent when the generator stops at start %s', (start) => {
    const f = fixture(start);
    f.loadCharger();
    f.session.frame(0.1);
    expect(f.command('generator', false)).toBeUndefined();
    const sources = f.session
      .power!.network.snapshot()
      .devices.filter((device) => ['solar', 'battery'].includes(base.powerDevices.get(device.type)!.kind));
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((device) => device.enabled)).toBe(true);
    expect(sources.some((device) => device.storedMicrojoules > 0)).toBe(true);
    expect(f.powered().every(Boolean)).toBe(true);
  });

  it('cuts and restores every consumer with the breaker while all sources remain available', () => {
    const f = fixture(43_200);
    f.loadCharger();
    f.session.frame(1.5);
    expect(f.powered().every(Boolean)).toBe(true);
    expect(f.snapshot().world.power!.devices.some((device) => device.storedMicrojoules > 0)).toBe(true);
    expect(f.command('switch', false)).toBeUndefined();
    expect(f.powered().every((powered) => !powered)).toBe(true);
    const sources = f.session
      .power!.network.snapshot()
      .devices.filter((device) => ['generator', 'solar', 'battery'].includes(base.powerDevices.get(device.type)!.kind));
    expect(sources.every((device) => device.enabled)).toBe(true);
    expect(f.command('switch', true)).toBeUndefined();
    expect(f.powered().every(Boolean)).toBe(true);
  });

  it('settles and disconnects a destroyed generator instead of leaving phantom supply', () => {
    const f = fixture();
    f.loadCharger();
    const generator = f.control('generator');
    expect(f.powered().every(Boolean)).toBe(true);
    expect(f.session.bashFurniture(generator, registry.furniture.get(generator.type)!.breach.durability)).toBe(true);
    expect(f.session.entities.byUid(generator.uid)).toBeUndefined();
    expect(f.powered().every((powered) => !powered)).toBe(true);
  });

  it.each(['generator', 'switch'] as const)('refuses the %s action out of reach without changing power', (role) => {
    const f = fixture(0, undefined, true);
    const before = f.session.power!.network.snapshot();
    expect(f.command(role, false)).toBeTypeOf('string');
    expect(f.session.power!.network.snapshot()).toEqual(before);
  });

  it('round-trips an open breaker, stopped generator and stored energy through save/load', async () => {
    const f = fixture(43_200);
    f.loadCharger();
    f.session.frame(0.1);
    expect(f.command('switch', false)).toBeUndefined();
    expect(f.command('generator', false)).toBeUndefined();
    const saved = f.snapshot();
    const decoded = await decodeSave(await encodeFixture(saved), { version: formatVersion, contentLookup });
    const restored = fixture(43_200, decoded.snapshot);
    expect(restored.session.power!.network.snapshot()).toEqual(saved.world.power);
    expect(restored.powered().every((powered) => !powered)).toBe(true);
    expect(restored.command('switch', true)).toBeUndefined();
    expect(restored.powered().every(Boolean)).toBe(true);
  });
});
