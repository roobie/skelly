import type { PlacedPowerDevice } from '@skelly/engine/internal/core/sitePower.ts';
import { decodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { Chunk, makeScale, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it, vi } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { startupContent } from './baseRegistry.ts';
import { contentLookup, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

vi.mock('@skelly/engine/internal/game/streamer.ts', () => {
  class Streamer {}
  // biome-ignore lint/style/useNamingConvention: the mocked module exports this class name.
  return { Streamer };
});

const content = startupContent();
const base = content.registry;
const scale = makeScale(0.5);
const shambler = base.actors.get('shambler')!;
// Three blocks wide, so the sense ray to the shade's emitter crosses the lamp's own body cells before its target
// cell: only the body exemption keeps an opaque fixture visible to the sense that feeds on it.
const registry = {
  ...base,
  furniture: new Map(
    [...base.furniture].map(([id, def]) =>
      id === 'electric_lamp'
        ? [
            id,
            {
              ...def,
              size: [3, 3, 1] as Vec3,
              power: { ...def.power!, light: { ...def.power!.light!, offset: [1, 2, 0] as [number, number, number] } },
            },
          ]
        : [id, def],
    ),
  ),
};
const device = (type: string, pos: Vec3, size: readonly number[]): PlacedPowerDevice => ({
  type,
  pos,
  entitySpec: { type, pos, size: [...size] as Vec3, facing: 'n', fixed: true },
});

/** One lamp, its breaker and its generator around the player, or around a far-away second spot. */
const place = (at: Vec3, breaker: Vec3, generator: Vec3): PlacedPowerDevice[] => [
  device('electric_lamp', at, [3, 3, 1]),
  device('main_breaker', breaker, [1, 2, 1]),
  device('fuel_generator', generator, [2, 2, 2]),
];
const near = place([11, 1, 0], [2, 1, 0], [15, 1, 0]);
const far = place([0, 1, 70], [2, 1, 70], [4, 1, 70]);

const fixture = ({
  devices = near,
  restore,
  wallX,
}: {
  devices?: PlacedPowerDevice[];
  restore?: SaveSnapshot;
  wallX?: number;
}) => {
  const world = new World();
  world.addChunk(new Chunk(0, 0, 0));
  // The fixture's own body blocks sight as a solid piece would; a wall column proves real obstruction.
  let placed: ReturnType<typeof createSession>['entities'] | undefined;
  const isOpaque = (x: number, y: number, z: number) =>
    y === 0 || placed?.obstructs(x, y, z, 'sight') === true || (wallX !== undefined && x === wallX && y >= 1);
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale,
    seed: 7,
    // Calendar zero is midnight, so the lamp is the only stimulus around.
    start: 0,
    spawn: [0, 1, 0],
    ready: () => true,
    isSolid: (_x, y) => y === 0,
    isOpaque,
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
    ...(restore ? { restore } : {}),
  });
  placed = session.entities;
  if (!restore) {
    for (const spec of devices) {
      session.inventory.furnishSpawn({ spec: spec.entitySpec!, loot: [] });
    }
  }
  session.sim.paused = false;
  const addShambler = (pos: Vec3, facing: Vec3) => session.actors.add(shambler, pos, facing);
  const breaker = () => [...session.entities.records].find((entity) => entity.type === 'main_breaker')!;
  return {
    session,
    addShambler,
    breaker,
    lampLight: () => session.power?.lights()[0],
    snapshot: () => session.snapshot({ worldId: 'fixed-light-fixture', characterId: 'survivor' }),
  };
};

describe('powered fixed lamps in the light sense', () => {
  it('draws a shambler to the shared emitter position, the lamp’s own body notwithstanding', () => {
    const f = fixture({});
    const id = f.addShambler([4, 1, 0.5], [1, 0, 0]);
    f.session.sim.scheduler.advance(0.1);
    const actor = f.session.actorStore.get(id)!;
    expect(actor.tier).toBe('active');
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.lastPerceived).toEqual(f.lampLight()!.pos);
  });

  it('leaves the lamp unsensed behind a wall that the same shambler sees it without', () => {
    const blocked = fixture({ wallX: 8 });
    const blockedId = blocked.addShambler([4, 1, 0.5], [1, 0, 0]);
    blocked.session.sim.scheduler.advance(0.1);
    expect(blocked.session.actorStore.get(blockedId)!.agent!.mode).toBe('idle');

    const open = fixture({});
    const openId = open.addShambler([4, 1, 0.5], [1, 0, 0]);
    open.session.sim.scheduler.advance(0.1);
    expect(open.session.actorStore.get(openId)!.agent!.mode).toBe('investigate');
  });

  it('cuts the lamp’s lure with its breaker and restores it', () => {
    const f = fixture({});
    expect(f.session.powerControl(f.breaker().uid, false)).toBeUndefined();
    const darkId = f.addShambler([4, 1, 0.5], [1, 0, 0]);
    f.session.sim.scheduler.advance(0.1);
    expect(f.session.actorStore.get(darkId)!.agent!.mode).toBe('idle');
    expect(f.session.powerControl(f.breaker().uid, true)).toBeUndefined();
    const litId = f.addShambler([5, 1, 0.5], [1, 0, 0]);
    f.session.sim.scheduler.advance(0.1);
    expect(f.session.actorStore.get(litId)!.agent!.mode).toBe('investigate');
  });

  it('draws a background-resident shambler through the same source', () => {
    const f = fixture({ devices: far });
    const id = f.addShambler([0, 1, 95], [0, 0, -1]);
    f.session.sim.scheduler.advance(1);
    const actor = f.session.actorStore.get(id)!;
    expect(actor.tier).toBe('background');
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.lastPerceived).toEqual(f.lampLight()!.pos);
  });

  it('keeps the lamp’s lure derived from restored power state across save and reload', async () => {
    const f = fixture({});
    const id = f.addShambler([4, 1, 0.5], [1, 0, 0]);
    f.session.sim.scheduler.advance(0.1);
    expect(f.session.actorStore.get(id)!.agent!.mode).toBe('investigate');
    const decoded = await decodeSave(await encodeFixture(f.snapshot()), { version: formatVersion, contentLookup });
    const reloaded = fixture({ restore: decoded.snapshot });
    const litId = reloaded.addShambler([5, 1, 0.5], [1, 0, 0]);
    reloaded.session.sim.scheduler.advance(0.1);
    expect(reloaded.session.actorStore.get(litId)!.agent!.mode).toBe('investigate');
    expect(reloaded.session.powerControl(reloaded.breaker().uid, false)).toBeUndefined();
    const darkId = reloaded.addShambler([6, 1, 0.5], [1, 0, 0]);
    reloaded.session.sim.scheduler.advance(0.1);
    expect(reloaded.session.actorStore.get(darkId)!.agent!.mode).toBe('idle');
  });
});
