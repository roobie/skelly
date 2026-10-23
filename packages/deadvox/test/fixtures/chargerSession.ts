import { Chunk } from '../../src/core/chunk.ts';
import type { Registry } from '../../src/core/content.ts';
import { CHUNK } from '../../src/core/coords.ts';
import type { SaveSnapshot } from '../../src/core/saveState.ts';
import { makeScale } from '../../src/core/scale.ts';
import { World } from '../../src/core/world.ts';
import { createSession, IDLE } from '../../src/game/session.ts';

export const createChargerSession = (base: Registry, restore?: Readonly<SaveSnapshot>) => {
  const charger = [...base.furniture.values()].find((entry) => entry.charger)!;
  const batteryType = charger.charger!.batteries[0]!;
  const battery = base.items.get(batteryType)!;
  const registry: Registry = {
    ...base,
    items: new Map([
      ...base.items,
      [batteryType, { ...battery, battery: { capacity: 1, rechargeable: { microjoulesPerCharge: 9_000_000_000 } } }],
    ]),
    powerDevices: new Map([
      ...base.powerDevices,
      [
        'test_charger_supply',
        { id: 'test_charger_supply', kind: 'generator', priority: 0, outputWatts: 100, burnLitresPerGameHour: 1 },
      ],
      ['test_charger_load', { id: 'test_charger_load', kind: 'consumer', priority: 1, demandWatts: 100 }],
    ]),
    furniture: new Map([
      ...base.furniture,
      [
        'test_charger_supply',
        {
          ...charger,
          id: 'test_charger_supply',
          charger: undefined,
          power: { device: 'test_charger_supply', fuelLitres: 10, enabled: true },
        },
      ],
      [
        charger.id,
        {
          ...charger,
          breach: { minimumStrength: 0, durability: 1 },
          ruin: { debris: [] },
          power: { device: 'test_charger_load', fuelLitres: 0, enabled: true },
        },
      ],
    ]),
  };
  let moving = 0;
  const solid = (_x: number, y: number) => y === 0;
  const world = new World();
  for (const cx of [-1, 0]) {
    for (const cz of [-1, 0]) {
      const chunk = new Chunk(cx, 0, cz);
      for (let x = 0; x < CHUNK; x += 1) {
        for (let z = 0; z < CHUNK; z += 1) {
          chunk.set(x, 0, z, registry.blockIds.get('planks')!);
        }
      }
      world.addChunk(chunk);
    }
  }
  const session = createSession({
    registry,
    ...(restore ? { restore } : {}),
    world,
    isSolid: solid,
    isOpaque: solid,
    scale: makeScale(0.5),
    seed: 17,
    start: 43_200,
    spawn: [0, 1, 0],
    ready: () => true,
    powerDevices: [
      { type: 'test_charger_supply', pos: [-2, 1, -1] },
      {
        type: charger.id,
        pos: [1, 1, 0],
        entitySpec: { type: charger.id, pos: [1, 1, 0], size: charger.size, facing: 'n' },
      },
    ],
    controls: {
      active: () => true,
      intent: () => ({ ...IDLE, forward: moving }),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  session.sim.paused = false;
  if (!restore) {
    session.entities.add({ type: 'test_charger_supply', pos: [-2, 1, -1], size: [1, 1, 1], facing: 'n' });
  }
  const supply = [...session.entities.records].find((entry) => entry.type === 'test_charger_supply')!;
  const entity = [...session.entities.records].find((entry) => entry.type === charger.id);
  if (entity && !restore) {
    session.entities.markSearched(entity);
  }
  return {
    session,
    entity,
    batteryType,
    registry,
    move: (value: number) => {
      moving = value;
    },
    advance: (seconds: number) => {
      for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
        session.frame(1 / 60);
      }
    },
    blackout: (off: boolean) => {
      const refusal = session.powerControl(supply.uid, !off);
      if (refusal) {
        throw new Error(refusal);
      }
    },
    snapshot: () => session.snapshot({ worldId: 'charger-world', characterId: 'charger-player' }),
  };
};
